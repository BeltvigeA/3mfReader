import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateObjectOrdering,
  parseObjectOrdering,
  annotateTopImage,
  encodeRgbaPng,
  decodeRgbaPng
} from '../src/imageOrderUtils.js';

function createBlankPixels(width, height, background = { r: 0, g: 0, b: 0, a: 0 }) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 4] = background.r;
    pixels[i * 4 + 1] = background.g;
    pixels[i * 4 + 2] = background.b;
    pixels[i * 4 + 3] = background.a;
  }
  return pixels;
}

function paintSquare(buffer, width, xStart, yStart, size, color) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pixelX = xStart + x;
      const pixelY = yStart + y;
      const idx = (pixelY * width + pixelX) * 4;
      buffer[idx] = color.r;
      buffer[idx + 1] = color.g;
      buffer[idx + 2] = color.b;
      buffer[idx + 3] = color.a;
    }
  }
}

test('parseObjectOrdering ranks objects by red intensity', () => {
  const width = 8;
  const height = 8;
  const pixels = createBlankPixels(width, height);

  paintSquare(pixels, width, 1, 1, 2, { r: 255, g: 0, b: 0, a: 255 });
  paintSquare(pixels, width, 4, 4, 2, { r: 120, g: 0, b: 0, a: 255 });
  paintSquare(pixels, width, 2, 5, 2, { r: 20, g: 0, b: 0, a: 255 });

  const pngBuffer = encodeRgbaPng({ width, height, data: pixels });
  const objects = parseObjectOrdering(pngBuffer);

  assert.equal(objects.length, 3);
  assert.deepEqual(objects.map(object => object.rank), [1, 2, 3]);
  assert.ok(objects[0].intensity > objects[1].intensity);
  assert.ok(objects[1].intensity > objects[2].intensity);
  assert.ok(objects[0].centroid.x > 0);
});

test('annotateTopImage overlays numbered labels', () => {
  const width = 12;
  const height = 12;
  const pickPixels = createBlankPixels(width, height);
  const topPixels = createBlankPixels(width, height, { r: 30, g: 30, b: 30, a: 255 });

  paintSquare(pickPixels, width, 2, 2, 2, { r: 250, g: 0, b: 0, a: 255 });
  paintSquare(pickPixels, width, 7, 7, 2, { r: 100, g: 0, b: 0, a: 255 });

  const pickBuffer = encodeRgbaPng({ width, height, data: pickPixels });
  const topBuffer = encodeRgbaPng({ width, height, data: topPixels });

  const { orderedObjects } = generateObjectOrdering(pickBuffer, topBuffer);
  const annotatedBuffer = annotateTopImage(topBuffer, orderedObjects);
  const decoded = decodeRgbaPng(annotatedBuffer);

  let whitePixels = 0;
  let darkPixels = 0;
  for (let i = 0; i < decoded.data.length; i += 4) {
    const r = decoded.data[i];
    const g = decoded.data[i + 1];
    const b = decoded.data[i + 2];
    const a = decoded.data[i + 3];

    if (r === 255 && g === 255 && b === 255 && a === 255) {
      whitePixels += 1;
    }
    if (r === 0 && g === 0 && b === 0 && a === 200) {
      darkPixels += 1;
    }
  }

  assert.ok(whitePixels > 0, 'expected numbered glyph pixels to be present');
  assert.ok(darkPixels > 0, 'expected label background to be present');
});
