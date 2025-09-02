import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { Storage } from '@google-cloud/storage';
import { parseMetadata } from './metadataUtils.js';
import { parseGcode } from './gcodeUtils.js';

const app = express();
const upload = multer({ dest: 'uploads/' });

const storage = new Storage();

async function uploadToGcs(filePath) {
  const bucket = storage.bucket(process.env.GCLOUD_BUCKET);
  const destination = path.basename(filePath);
  await bucket.upload(filePath, {
    destination,
    metadata: { contentType: 'application/zip' }
  });
}

app.post('/process-file', upload.single('file'), async (req, res) => {
  try {
    const tempPath = req.file.path;
    const zipPath = `${tempPath}.zip`;
    await fs.rename(tempPath, zipPath);
    await uploadToGcs(zipPath);

    const zip = new AdmZip(zipPath);
    const metadataEntry = zip.getEntry('Metadata/metadata.xml') || zip.getEntry('metadata.xml');
    const metadata = metadataEntry ? parseMetadata(metadataEntry.getData().toString()) : {};
    const imageEntry = zip.getEntry('Metadata/plate_1.png');
    const image = imageEntry ? imageEntry.getData().toString('base64') : null;
    const gcodeEntry = zip.getEntry('plate.gcode');
    const gcodeData = gcodeEntry ? gcodeEntry.getData().toString() : null;
    const gcodeInfo = gcodeData ? parseGcode(gcodeData) : {};

    res.json({ metadata, gcodeInfo, image, gcodeData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Server listening on port 3000');
});
