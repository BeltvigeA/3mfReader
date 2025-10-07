# 3MF Processing API

This project provides an Express-based API that accepts `.gcode.3mf` files, converts them to ZIP, reads metadata, returns the `plate_1` image and the `plate.gcode` contents. Files are processed in memory and removed immediately after the response, so nothing is stored on the server.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Run the server**

   ```bash
   npm start
   ```

## API Usage

Send a `POST` request to `/process-file` with form-data containing the uploaded `.gcode.3mf` file under the `file` field. The API responds with JSON containing the assets and analytics gathered from the archive.

### Response fields

| Field | Type | Description |
| --- | --- | --- |
| `metadata` | object | Parsed contents of `Metadata/metadata.xml`, including detected plates and their objects. |
| `gcodeInfo` | object | Summary produced by the G-code parser (for example total print time and travel metrics). |
| `image` | string | Base64-encoded `Metadata/plate_1.png`. |
| `gcodeData` | string | Raw `plate.gcode` text. |
| `pickImage` | string or `null` | Base64-encoded `Metadata/pick_1.png` if present. |
| `topImage` | string or `null` | Base64-encoded `Metadata/top_1.png` if present. |
| `annotatedTopImage` | string or `null` | Base64 overlay of `top_1.png` that includes the numerically ranked labels derived from `pick_1.png`. |
| `objectOrdering` | array | Ranked list of detected objects in print order (first item corresponds to label `1`). Each entry includes coordinates and color data extracted from `pick_1.png`. |
| `sliceInfoConfig` | string or `null` | Raw `Metadata/slice_info.config` text when available. |
| `sliceInfoMatchCount` | number | Count of unskipped plate objects that also appear in `slice_info.config`. |
| `sliceInfoOrderedObjects` | array | Slice info objects sorted by `identifyId` and enriched with their corresponding print rank (if one was detected). |
| `modelSettingsConfig` | string or `null` | Raw `Metadata/model_settings.config` text when available. |
| `modelSettingsMatchCount` | number | Count of unskipped plate objects that also appear in `model_settings.config`. |

To consume these fields from another service (for example base44.com), POST the `.gcode.3mf` archive to `/process-file`, decode the Base64 image properties you need, and read the JSON keys listed above to align object IDs, print order, and metadata with your own system.

## Testing

Run unit tests and lint checks:

```bash
npm test
npm run lint
```
