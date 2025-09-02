# 3MF Processing API

This project provides an Express-based API that accepts `.gcode.3mf` files, converts them to ZIP, reads metadata, returns the `plate_1` image and the `plate.gcode` contents, and uploads the ZIP archive to Google Cloud Storage.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure Google Cloud credentials**

   Provide credentials for a service account with access to the target bucket and set the bucket name:

   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"
   export GCLOUD_BUCKET="your-bucket-name"
   ```

3. **Run the server**

   ```bash
   npm start
   ```

## API Usage

Send a `POST` request to `/process-file` with form-data containing the uploaded `.gcode.3mf` file under the `file` field. The API responds with JSON including parsed metadata, a Base64 image `plate_1`, and the `plate.gcode` text.

## Google Cloud Hosting

Google Cloud Storage is used for storing the processed ZIP file. You can deploy the API on Google Cloud Run:

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/mto-express
gcloud run deploy mto-express --image gcr.io/PROJECT_ID/mto-express --platform managed --allow-unauthenticated
```

After deployment, send `POST` requests to the service URL from any program to retrieve metadata, the `plate_1` image, and `plate.gcode` contents.

## Testing

Run unit tests and lint checks:

```bash
npm test
npm run lint
```
