import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { encodeRgbaPng, decodeRgbaPng } from '../src/imageOrderUtils.js';

process.env.NODE_ENV = 'test';
const processFileHandlerPromise = (async () => (await import('../src/index.js')).processFileHandler)();

async function invokeHandlerWithBuffer(zipBuffer) {
  const processFileHandler = await processFileHandlerPromise;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'process-file-handler-'));
  const tempFilePath = path.join(tempDir, 'upload');
  await fs.writeFile(tempFilePath, zipBuffer);

  const req = { file: { path: tempFilePath } };
  const response = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    }
  };

  try {
    await processFileHandler(req, response);
    return response;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('process-file returns auxiliary metadata assets when available', async () => {
  const zip = new AdmZip();
  const metadataXml = `<?xml version="1.0"?>
    <config>
      <plate index="1">
        <object identify_id="101" name="First" skipped="false" />
        <object identify_id="205" name="Second" skipped="false" />
        <object identify_id="307" name="Third" skipped="true" />
      </plate>
    </config>`;
  zip.addFile('Metadata/metadata.xml', Buffer.from(metadataXml));
  zip.addFile('Metadata/plate_1.png', Buffer.from('main-image'));
  const imageWidth = 10;
  const imageHeight = 10;
  const pickPixels = Buffer.alloc(imageWidth * imageHeight * 4);
  const topPixels = Buffer.alloc(imageWidth * imageHeight * 4, 180);

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

  paintSquare(pickPixels, imageWidth, 1, 1, 2, { r: 255, g: 0, b: 0, a: 255 });
  paintSquare(pickPixels, imageWidth, 5, 5, 2, { r: 120, g: 0, b: 0, a: 255 });
  paintSquare(pickPixels, imageWidth, 7, 1, 2, { r: 20, g: 0, b: 0, a: 255 });

  const pickImageBuffer = encodeRgbaPng({ width: imageWidth, height: imageHeight, data: pickPixels });
  const topImageBuffer = encodeRgbaPng({ width: imageWidth, height: imageHeight, data: topPixels });

  zip.addFile('metadata/pick_1.png', pickImageBuffer);
  zip.addFile('Metadata/top_1.png', topImageBuffer);
  const sliceInfoXml = `<?xml version="1.0"?>
    <config>
      <object identify_id="101" name="First Slice" skipped="false" />
      <object identify_id="150" name="Intermediate" skipped="false" />
      <object identify_id="205" name="Second Slice" skipped="false" />
    </config>`;
  zip.addFile('metadata/slice_info.config', Buffer.from(sliceInfoXml));
  const modelSettingsXml = `<?xml version="1.0"?>
    <settings>
      <model identify_id="205" name="Second" skipped="false" />
      <model identify_id="400" name="Extra" skipped="false" />
    </settings>`;
  zip.addFile('Metadata/model_settings.config', Buffer.from(modelSettingsXml));
  zip.addFile('plate.gcode', Buffer.from(';model printing time: 120'));

  const response = await invokeHandlerWithBuffer(zip.toBuffer());

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.pickImage, pickImageBuffer.toString('base64'));
  assert.equal(response.payload.topImage, topImageBuffer.toString('base64'));
  assert.equal(response.payload.sliceInfoConfig, sliceInfoXml);
  assert.equal(response.payload.modelSettingsConfig, modelSettingsXml);
  assert.ok(Array.isArray(response.payload.objectOrdering));
  assert.equal(response.payload.objectOrdering.length, 3);
  assert.equal(response.payload.objectOrdering[0].rank, 1);
  assert.equal(response.payload.objectOrdering[0].color.r, 255);
  assert.ok(typeof response.payload.annotatedTopImage === 'string');
  assert.equal(response.payload.sliceInfoMatchCount, 2);
  assert.equal(response.payload.modelSettingsMatchCount, 1);
  assert.equal(response.payload.sliceInfoOrderedObjects.length, 3);
  assert.deepEqual(
    response.payload.sliceInfoOrderedObjects.map(entry => ({ rank: entry.rank, identifyId: entry.identifyId })),
    [
      { rank: 1, identifyId: '101' },
      { rank: 2, identifyId: '150' },
      { rank: 3, identifyId: '205' }
    ]
  );

  const annotatedBuffer = Buffer.from(response.payload.annotatedTopImage, 'base64');
  const decodedAnnotated = decodeRgbaPng(annotatedBuffer);
  let whitePixelCount = 0;
  for (let i = 0; i < decodedAnnotated.data.length; i += 4) {
    if (
      decodedAnnotated.data[i] === 255 &&
      decodedAnnotated.data[i + 1] === 255 &&
      decodedAnnotated.data[i + 2] === 255 &&
      decodedAnnotated.data[i + 3] === 255
    ) {
      whitePixelCount += 1;
    }
  }
  assert.ok(whitePixelCount > 0, 'Annotated image should contain label pixels');
});

test('process-file omits auxiliary metadata assets when unavailable', async () => {
  const zip = new AdmZip();
  zip.addFile('Metadata/metadata.xml', Buffer.from('<meta>example</meta>'));
  zip.addFile('plate.gcode', Buffer.from(';model printing time: 120'));

  const response = await invokeHandlerWithBuffer(zip.toBuffer());

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.pickImage, null);
  assert.equal(response.payload.topImage, null);
  assert.equal(response.payload.sliceInfoConfig, null);
  assert.equal(response.payload.modelSettingsConfig, null);
  assert.deepEqual(response.payload.objectOrdering, []);
  assert.equal(response.payload.annotatedTopImage, null);
  assert.equal(response.payload.sliceInfoMatchCount, 0);
  assert.equal(response.payload.modelSettingsMatchCount, 0);
  assert.deepEqual(response.payload.sliceInfoOrderedObjects, []);
});
