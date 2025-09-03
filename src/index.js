import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import AdmZip from 'adm-zip';
import { parseMetadata } from './metadataUtils.js';
import { parseGcode } from './gcodeUtils.js';

const app = express();
const upload = multer({ dest: 'uploads/' });

app.post('/process-file', upload.single('file'), async (req, res) => {
  let zipPath;
  try {
    const tempPath = req.file.path;
    zipPath = `${tempPath}.zip`;
    await fs.rename(tempPath, zipPath);

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
  } finally {
    if (zipPath) {
      await fs.unlink(zipPath).catch(() => {});
    }
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
