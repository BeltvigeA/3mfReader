import { inflateSync, deflateSync } from 'node:zlib';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readUInt32BE(buffer, offset) {
  return (
    (buffer[offset] << 24) |
    (buffer[offset + 1] << 16) |
    (buffer[offset + 2] << 8) |
    buffer[offset + 3]
  ) >>> 0;
}

function createCrc32Table() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      if ((c & 1) !== 0) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c >>>= 1;
      }
    }
    table[n] = c >>> 0;
  }
  return table;
}

const crc32Table = createCrc32Table();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = crc32Table[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function applySubFilter(scanline, bytesPerPixel) {
  for (let i = bytesPerPixel; i < scanline.length; i += 1) {
    scanline[i] = (scanline[i] + scanline[i - bytesPerPixel]) & 0xff;
  }
}

function applyUpFilter(scanline, prior, bytesPerPixel) {
  if (!prior) {
    return;
  }
  for (let i = 0; i < scanline.length; i += 1) {
    scanline[i] = (scanline[i] + prior[i]) & 0xff;
  }
}

function applyAverageFilter(scanline, prior, bytesPerPixel) {
  for (let i = 0; i < scanline.length; i += 1) {
    const left = i >= bytesPerPixel ? scanline[i - bytesPerPixel] : 0;
    const up = prior ? prior[i] : 0;
    scanline[i] = (scanline[i] + Math.floor((left + up) / 2)) & 0xff;
  }
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);

  if (pa <= pb && pa <= pc) {
    return a;
  }
  if (pb <= pc) {
    return b;
  }
  return c;
}

function applyPaethFilter(scanline, prior, bytesPerPixel) {
  for (let i = 0; i < scanline.length; i += 1) {
    const left = i >= bytesPerPixel ? scanline[i - bytesPerPixel] : 0;
    const up = prior ? prior[i] : 0;
    const upLeft = prior && i >= bytesPerPixel ? prior[i - bytesPerPixel] : 0;
    scanline[i] = (scanline[i] + paethPredictor(left, up, upLeft)) & 0xff;
  }
}

function ensureRgbaColorType(ihdr) {
  const { bitDepth, colorType, compressionMethod, filterMethod, interlaceMethod } = ihdr;
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error('Only 8-bit RGBA PNG images are supported');
  }
  if (compressionMethod !== 0 || filterMethod !== 0) {
    throw new Error('Unsupported PNG compression or filter method');
  }
  if (interlaceMethod !== 0) {
    throw new Error('Interlaced PNG images are not supported');
  }
}

export function decodeRgbaPng(buffer) {
  if (!buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error('Invalid PNG signature');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let ihdr;
  const idatChunks = [];

  while (offset < buffer.length) {
    const chunkLength = readUInt32BE(buffer, offset);
    offset += 4;
    const chunkType = buffer.subarray(offset, offset + 4).toString('ascii');
    offset += 4;
    const chunkData = buffer.subarray(offset, offset + chunkLength);
    offset += chunkLength;
    offset += 4; // skip CRC

    if (chunkType === 'IHDR') {
      width = readUInt32BE(chunkData, 0);
      height = readUInt32BE(chunkData, 4);
      ihdr = {
        width,
        height,
        bitDepth: chunkData[8],
        colorType: chunkData[9],
        compressionMethod: chunkData[10],
        filterMethod: chunkData[11],
        interlaceMethod: chunkData[12]
      };
    } else if (chunkType === 'IDAT') {
      idatChunks.push(chunkData);
    } else if (chunkType === 'IEND') {
      break;
    }
  }

  if (!ihdr) {
    throw new Error('PNG missing IHDR chunk');
  }

  ensureRgbaColorType(ihdr);

  const compressedData = Buffer.concat(idatChunks);
  const decompressed = inflateSync(compressedData);
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const result = Buffer.alloc(width * height * bytesPerPixel);

  let srcOffset = 0;
  let destOffset = 0;
  let priorScanline = null;

  for (let y = 0; y < height; y += 1) {
    const filterType = decompressed[srcOffset];
    srcOffset += 1;

    const scanline = Buffer.from(decompressed.subarray(srcOffset, srcOffset + stride));
    srcOffset += stride;

    switch (filterType) {
      case 0:
        break;
      case 1:
        applySubFilter(scanline, bytesPerPixel);
        break;
      case 2:
        applyUpFilter(scanline, priorScanline, bytesPerPixel);
        break;
      case 3:
        applyAverageFilter(scanline, priorScanline, bytesPerPixel);
        break;
      case 4:
        applyPaethFilter(scanline, priorScanline, bytesPerPixel);
        break;
      default:
        throw new Error(`Unsupported PNG filter type: ${filterType}`);
    }

    scanline.copy(result, destOffset);
    destOffset += stride;
    priorScanline = scanline;
  }

  return { width, height, data: result };
}

function createChunk(type, data) {
  const chunkType = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcValue = crc32(Buffer.concat([chunkType, data]));
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crcValue >>> 0, 0);
  return Buffer.concat([lengthBuffer, chunkType, data, crcBuffer]);
}

export function encodeRgbaPng({ width, height, data }) {
  if (data.length !== width * height * 4) {
    throw new Error('Pixel data size does not match width and height');
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // no interlace

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const scanlines = Buffer.alloc((stride + 1) * height);
  let srcOffset = 0;
  let destOffset = 0;

  for (let y = 0; y < height; y += 1) {
    scanlines[destOffset] = 0; // filter type 0
    destOffset += 1;
    data.copy(scanlines, destOffset, srcOffset, srcOffset + stride);
    srcOffset += stride;
    destOffset += stride;
  }

  const compressed = deflateSync(scanlines, { level: 9 });

  const ihdrChunk = createChunk('IHDR', ihdrData);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk]);
}

function colorKey(r, g, b, a) {
  return `${r},${g},${b},${a}`;
}

function computeRedIntensity(r, g, b) {
  return r - (g + b) / 2;
}

function buildObjectsFromPixels(imageData, { minAlpha = 16 } = {}) {
  const { width, height, data } = imageData;
  const objects = new Map();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a < minAlpha) {
        continue;
      }

      const key = colorKey(r, g, b, a);
      let entry = objects.get(key);
      if (!entry) {
        entry = {
          color: { r, g, b, a },
          pixelCount: 0,
          sumX: 0,
          sumY: 0
        };
        objects.set(key, entry);
      }

      entry.pixelCount += 1;
      entry.sumX += x;
      entry.sumY += y;
    }
  }

  return Array.from(objects.values())
    .filter(object => object.pixelCount > 0)
    .map(object => {
      const { color, pixelCount, sumX, sumY } = object;
      const centroid = {
        x: sumX / pixelCount,
        y: sumY / pixelCount
      };
      const intensity = computeRedIntensity(color.r, color.g, color.b);
      return {
        color,
        pixelCount,
        centroid,
        intensity
      };
    })
    .sort((a, b) => {
      if (b.intensity !== a.intensity) {
        return b.intensity - a.intensity;
      }
      if (b.color.r !== a.color.r) {
        return b.color.r - a.color.r;
      }
      return b.pixelCount - a.pixelCount;
    })
    .map((object, index) => ({
      rank: index + 1,
      ...object
    }));
}

const digitGlyphs = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['01110', '10001', '00001', '00110', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100']
};

function setPixel(data, width, x, y, { r, g, b, a }) {
  if (x < 0 || y < 0 || x >= width || y >= data.length / (width * 4)) {
    return;
  }
  const idx = (y * width + x) * 4;
  data[idx] = r;
  data[idx + 1] = g;
  data[idx + 2] = b;
  data[idx + 3] = a;
}

function drawDigit(data, width, startX, startY, digit, color) {
  const glyph = digitGlyphs[digit];
  if (!glyph) {
    return;
  }
  for (let row = 0; row < glyph.length; row += 1) {
    const line = glyph[row];
    for (let col = 0; col < line.length; col += 1) {
      if (line[col] === '1') {
        setPixel(data, width, startX + col, startY + row, color);
      }
    }
  }
}

function drawLabel(data, width, height, centroid, label) {
  const digitWidth = 5;
  const digitHeight = 7;
  const digitSpacing = 1;
  const padding = 2;
  const digits = label.split('');
  const labelWidth = digits.length * digitWidth + (digits.length - 1) * digitSpacing + padding * 2;
  const labelHeight = digitHeight + padding * 2;

  const centerX = Math.round(centroid.x);
  const centerY = Math.round(centroid.y);

  const startX = Math.min(Math.max(centerX - Math.floor(labelWidth / 2), 0), Math.max(width - labelWidth, 0));
  const startY = Math.min(Math.max(centerY - Math.floor(labelHeight / 2), 0), Math.max(height - labelHeight, 0));

  const backgroundColor = { r: 0, g: 0, b: 0, a: 200 };
  const textColor = { r: 255, g: 255, b: 255, a: 255 };

  for (let y = 0; y < labelHeight; y += 1) {
    for (let x = 0; x < labelWidth; x += 1) {
      setPixel(data, width, startX + x, startY + y, backgroundColor);
    }
  }

  let digitOffsetX = startX + padding;
  const digitOffsetY = startY + padding;

  for (const digit of digits) {
    drawDigit(data, width, digitOffsetX, digitOffsetY, digit, textColor);
    digitOffsetX += digitWidth + digitSpacing;
  }
}

export function parseObjectOrdering(pickImageBuffer, options = {}) {
  if (!pickImageBuffer) {
    return [];
  }
  const imageData = decodeRgbaPng(pickImageBuffer);
  return buildObjectsFromPixels(imageData, options);
}

export function annotateTopImage(topImageBuffer, orderedObjects) {
  if (!topImageBuffer) {
    return null;
  }
  const topImageData = decodeRgbaPng(topImageBuffer);
  const annotatedPixels = Buffer.from(topImageData.data);

  for (const object of orderedObjects) {
    drawLabel(annotatedPixels, topImageData.width, topImageData.height, object.centroid, String(object.rank));
  }

  return encodeRgbaPng({ width: topImageData.width, height: topImageData.height, data: annotatedPixels });
}

export function generateObjectOrdering(pickImageBuffer, topImageBuffer, options = {}) {
  if (!pickImageBuffer || !topImageBuffer) {
    return { orderedObjects: [], annotatedImage: null };
  }

  const orderedObjects = parseObjectOrdering(pickImageBuffer, options.pickOptions);
  const annotatedImage = orderedObjects.length > 0
    ? annotateTopImage(topImageBuffer, orderedObjects, options.annotationOptions)
    : Buffer.from(topImageBuffer);

  return { orderedObjects, annotatedImage };
}
