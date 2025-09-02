# 3MF Processing API

This project provides an Express-based API that accepts `.gcode.3mf` files, converts them to ZIP, reads metadata, returns the `plate_1` image and the `plate.gcode` contents, and uploads the ZIP archive to Backblaze B2.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure Backblaze B2 credentials**

   Set environment variables for your B2 account:

   ```bash
   export B2_KEY_ID="your-key-id"
   export B2_APPLICATION_KEY="your-application-key"
   export B2_BUCKET_ID="your-bucket-id"
   ```

3. **Run the server**

   ```bash
   npm start
   ```

## API Usage

Send a `POST` request to `/process-file` with form-data containing the uploaded `.gcode.3mf` file under the `file` field. The API responds with JSON including parsed metadata, a Base64 image `plate_1`, and the `plate.gcode` text.

## Backblaze B2 Hosting

Backblaze B2 is used for storing the processed ZIP file. This API uploads the converted archive to the specified B2 bucket during processing. The API itself should be deployed on your preferred runtime (e.g., a cloud VM or container service) with network access to Backblaze B2.

## Testing

Run unit tests and lint checks:

```bash
npm test
npm run lint
```
