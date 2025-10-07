import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import AdmZip from 'adm-zip';
import { parseMetadata, parseSliceInfoConfig, parseModelSettingsConfig } from './metadataUtils.js';
import { parseGcode } from './gcodeUtils.js';
import { generateObjectOrdering } from './imageOrderUtils.js';

const app = express();
const upload = multer({ dest: 'uploads/' });

function getEntryCaseInsensitive(zipInstance, targetPath) {
  const directEntry = zipInstance.getEntry(targetPath);
  if (directEntry) {
    return directEntry;
  }

  const lowerTarget = targetPath.toLowerCase();
  return zipInstance.getEntries().find(entry => entry.entryName.toLowerCase() === lowerTarget) || null;
}

export async function processFileHandler(req, res) {
  let zipPath;
  try {
    const tempPath = req.file.path;
    zipPath = `${tempPath}.zip`;
    await fs.rename(tempPath, zipPath);

    const zip = new AdmZip(zipPath);
    const metadataEntry = zip.getEntry('Metadata/metadata.xml') || zip.getEntry('metadata.xml');
    const metadata = metadataEntry
      ? await parseMetadata(metadataEntry.getData().toString())
      : { tree: null, plates: [], objects: [] };
    const imageEntry = zip.getEntry('Metadata/plate_1.png');
    const image = imageEntry ? imageEntry.getData().toString('base64') : null;
    const gcodeEntry = zip.getEntry('plate.gcode');
    const gcodeData = gcodeEntry ? gcodeEntry.getData().toString() : null;
    const gcodeInfo = gcodeData ? parseGcode(gcodeData) : {};

    const pickImageEntry = getEntryCaseInsensitive(zip, 'Metadata/pick_1.png');
    const pickImageBuffer = pickImageEntry ? pickImageEntry.getData() : null;
    const pickImage = pickImageBuffer ? pickImageBuffer.toString('base64') : null;

    const topImageEntry = getEntryCaseInsensitive(zip, 'Metadata/top_1.png');
    const topImageBuffer = topImageEntry ? topImageEntry.getData() : null;
    const topImage = topImageBuffer ? topImageBuffer.toString('base64') : null;

    let objectOrdering = [];
    let annotatedTopImage = null;
    if (pickImageBuffer && topImageBuffer) {
      try {
        const { orderedObjects, annotatedImage } = generateObjectOrdering(pickImageBuffer, topImageBuffer);
        objectOrdering = orderedObjects;
        annotatedTopImage = annotatedImage ? annotatedImage.toString('base64') : null;
      } catch (processingError) {
        objectOrdering = [];
        annotatedTopImage = null;
        console.warn('Failed to build annotated top image:', processingError);
      }
    }

    const sliceInfoEntry = getEntryCaseInsensitive(zip, 'Metadata/slice_info.config');
    const sliceInfoConfig = sliceInfoEntry ? sliceInfoEntry.getData().toString() : null;

    const modelSettingsEntry = getEntryCaseInsensitive(zip, 'Metadata/model_settings.config');
    const modelSettingsConfig = modelSettingsEntry ? modelSettingsEntry.getData().toString() : null;

    const metadataObjects = Array.isArray(metadata.objects) ? metadata.objects : [];
    const activePlateIds = new Set(
      metadataObjects
        .filter(objectEntry => objectEntry && !objectEntry.skipped && objectEntry.identifyId != null)
        .map(objectEntry => String(objectEntry.identifyId))
    );

    const sliceInfoParsed = sliceInfoConfig ? await parseSliceInfoConfig(sliceInfoConfig) : { objects: [] };
    const sliceInfoObjects = Array.isArray(sliceInfoParsed.objects) ? sliceInfoParsed.objects : [];
    const activeSliceInfoIds = new Set(
      sliceInfoObjects
        .filter(objectEntry => objectEntry && !objectEntry.skipped && objectEntry.identifyId != null)
        .map(objectEntry => String(objectEntry.identifyId))
    );

    const sliceInfoMatchCount = [...activePlateIds].filter(id => activeSliceInfoIds.has(id)).length;

    const modelSettingsParsed = modelSettingsConfig ? await parseModelSettingsConfig(modelSettingsConfig) : { objects: [] };
    const modelSettingsObjects = Array.isArray(modelSettingsParsed.objects) ? modelSettingsParsed.objects : [];
    const activeModelSettingsIds = new Set(
      modelSettingsObjects
        .filter(objectEntry => objectEntry && !objectEntry.skipped && objectEntry.identifyId != null)
        .map(objectEntry => String(objectEntry.identifyId))
    );

    const modelSettingsMatchCount = [...activePlateIds].filter(id => activeModelSettingsIds.has(id)).length;

    function compareIdentifyIds(a, b) {
      const parseNumeric = value => {
        if (value === null || value === undefined) {
          return Number.POSITIVE_INFINITY;
        }
        const match = String(value).match(/-?\d+(?:\.\d+)?/);
        return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
      };

      const aNumeric = parseNumeric(a.identifyId);
      const bNumeric = parseNumeric(b.identifyId);
      if (aNumeric !== bNumeric) {
        return aNumeric - bNumeric;
      }
      const aId = a.identifyId == null ? '' : String(a.identifyId);
      const bId = b.identifyId == null ? '' : String(b.identifyId);
      return aId.localeCompare(bId);
    }

    const sortedSliceInfoObjects = [...sliceInfoObjects].sort(compareIdentifyIds);
    const sliceInfoOrderedObjects = sortedSliceInfoObjects.map((objectEntry, index) => ({
      rank: objectOrdering[index] ? objectOrdering[index].rank : null,
      identifyId: objectEntry.identifyId ?? null,
      name: objectEntry.name ?? null,
      skipped: Boolean(objectEntry.skipped)
    }));

    res.json({
      metadata,
      gcodeInfo,
      image,
      gcodeData,
      pickImage,
      topImage,
      sliceInfoConfig,
      sliceInfoMatchCount,
      sliceInfoOrderedObjects,
      modelSettingsConfig,
      modelSettingsMatchCount,
      objectOrdering,
      annotatedTopImage
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (zipPath) {
      await fs.unlink(zipPath).catch(() => {});
    }
  }
}

app.post('/process-file', upload.single('file'), processFileHandler);

const port = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

export default app;
