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

Send a `POST` request to `/process-file` with form-data containing the uploaded `.gcode.3mf` file under the `file` field. The API responds with JSON including parsed metadata, a Base64 image `plate_1`, and the `plate.gcode` text.

## Testing

Run unit tests and lint checks:

```bash
npm test
npm run lint
```
