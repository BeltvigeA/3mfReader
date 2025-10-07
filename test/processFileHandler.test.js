import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';

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
  zip.addFile('Metadata/metadata.xml', Buffer.from('<meta>example</meta>'));
  zip.addFile('Metadata/plate_1.png', Buffer.from('main-image'));
  zip.addFile('metadata/pick_1.png', Buffer.from('pick-image'));
  zip.addFile('Metadata/top_1.png', Buffer.from('top-image'));
  zip.addFile('metadata/slice_info.config', Buffer.from('slice configuration data'));
  zip.addFile('plate.gcode', Buffer.from(';model printing time: 120'));

  const response = await invokeHandlerWithBuffer(zip.toBuffer());

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.pickImage, Buffer.from('pick-image').toString('base64'));
  assert.equal(response.payload.topImage, Buffer.from('top-image').toString('base64'));
  assert.equal(response.payload.sliceInfoConfig, 'slice configuration data');
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
});
