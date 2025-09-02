import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import B2 from 'backblaze-b2';
import { parseMetadata } from './metadataUtils.js';
import { parseGcode } from './gcodeUtils.js';

const app = express();
const upload = multer({ dest: 'uploads/' });

const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY
});

async function uploadToB2(filePath) {
  await b2.authorize();
  const { data: uploadData } = await b2.getUploadUrl({ bucketId: process.env.B2_BUCKET_ID });
  const fileName = path.basename(filePath);
  await b2.uploadFile({
    uploadUrl: uploadData.uploadUrl,
    uploadAuthToken: uploadData.authorizationToken,
    fileName,
    data: await fs.readFile(filePath),
    mime: 'application/zip'
  });
}

app.post('/process-file', upload.single('file'), async (req, res) => {
  try {
    const tempPath = req.file.path;
    const zipPath = `${tempPath}.zip`;
    await fs.rename(tempPath, zipPath);
    await uploadToB2(zipPath);

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
