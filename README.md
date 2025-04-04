# HTML Converter API

API to extract HTML files from ZIP archives and convert embedded images to base64 format, as well as convert DOCX files to HTML with base64 images.

## Features

- Accepts ZIP files containing HTML and image files
- Extracts the HTML and associated images
- Converts all image references in the HTML to base64 format
- Accepts DOCX files and converts them to HTML with base64 images
- Uses Aspose API for DOCX to HTML conversion
- Cleans up temporary files automatically
- Returns the processed HTML with embedded base64 images
- Includes Swagger documentation
- Provides a web interface for easy testing

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd html-converter-api

# Install dependencies
npm install

# Start the server
npm start
```

## API Documentation

This API includes Swagger documentation which can be accessed at `/api-docs` when the server is running.

### Swagger UI

The Swagger UI provides a visual interface for exploring and testing the API endpoints:

- **URL**: http://localhost:3000/api-docs
- **Raw Swagger JSON**: http://localhost:3000/api/swagger.json

## API Endpoints

### Convert ZIP to HTML with Base64 Images

**Endpoint**: `POST /api/convert`

**Request**: 
- Content-Type: `multipart/form-data`
- Body: 
  - `zipFile`: The ZIP file containing HTML and images

**Response**:
```json
{
  "success": true,
  "message": "HTML processed successfully",
  "data": {
    "html": "<html>...</html>", // The processed HTML content
    "stats": {
      "fileName": "example.html",
      "fileSize": "0.82 MB",
      "imagesConverted": 42,
      "totalImages": 42,
      "success": true
    }
  }
}
```

### Convert DOCX to HTML with Base64 Images

**Endpoint**: `POST /api/docx-to-html`

**Request**: 
- Content-Type: `multipart/form-data`
- Body: 
  - `docxFile`: The DOCX file to convert

**Response**:
```json
{
  "success": true,
  "message": "DOCX processed successfully",
  "data": {
    "html": "<html>...</html>", // The processed HTML content
    "stats": {
      "fileName": "example.docx",
      "fileSize": "0.95 MB",
      "imagesConverted": 15,
      "totalImages": 15,
      "success": true
    }
  }
}
```

### Health Check

**Endpoint**: `GET /api/health`

**Response**:
```json
{
  "status": "OK",
  "message": "API is running"
}
```

## Usage Examples

### Using cURL

```bash
# Convert ZIP file
curl -X POST -F "zipFile=@/path/to/your/file.zip" http://localhost:3000/api/convert -o response.json

# Convert DOCX file
curl -X POST -F "docxFile=@/path/to/your/file.docx" http://localhost:3000/api/docx-to-html -o response.json
```

### Using Fetch API (JavaScript)

```javascript
// For ZIP files
const formData = new FormData();
const fileInput = document.querySelector('input[type="file"]');
formData.append('zipFile', fileInput.files[0]);

fetch('http://localhost:3000/api/convert', {
  method: 'POST',
  body: formData
})
.then(response => response.json())
.then(data => {
  if (data.success) {
    // Use the processed HTML
    document.getElementById('result').innerHTML = data.data.html;
    
    // Display stats
    console.log('Conversion stats:', data.data.stats);
  } else {
    console.error('Error:', data.message);
  }
})
.catch(error => {
  console.error('Error:', error);
});

// For DOCX files
const formData = new FormData();
const fileInput = document.querySelector('input[type="file"]');
formData.append('docxFile', fileInput.files[0]);

fetch('http://localhost:3000/api/docx-to-html', {
  method: 'POST',
  body: formData
})
.then(response => response.json())
.then(data => {
  if (data.success) {
    // Use the processed HTML
    document.getElementById('result').innerHTML = data.data.html;
    
    // Display stats
    console.log('Conversion stats:', data.data.stats);
  } else {
    console.error('Error:', data.message);
  }
})
.catch(error => {
  console.error('Error:', error);
});
```

## Web Interface

The API includes a web interface for easy testing, which can be accessed at the root URL when the server is running:

- **URL**: http://localhost:3000/

The interface provides:
- A tab to upload and process ZIP files
- A tab to upload and process DOCX files
- Display of conversion statistics
- Preview of the converted HTML
- Display of the raw HTML code

## Project Structure

```
html-converter-api/
├── api.js               # Main API entry point
├── html_processor.js    # HTML and image processing logic for ZIP files
├── process.js           # ZIP processing utilities
├── docx_converter.js    # DOCX to HTML conversion
├── swagger.js           # Swagger configuration
├── public/              # Static web interface
│   └── index.html       # HTML test interface
├── Dockerfile           # Docker configuration
├── docker-compose.yml   # Docker Compose setup
└── package.json         # Node.js dependencies
```

## Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d
```

## Triển khai trên Railway

Để triển khai dự án này trên Railway, hãy làm theo các bước sau:

1. Đăng ký tài khoản trên [Railway](https://railway.app/)
2. Kết nối repository của bạn với Railway 
3. Railway sẽ tự động phát hiện Dockerfile và triển khai ứng dụng
4. Bạn có thể thêm biến môi trường trong phần "Variables" của dự án Railway

Các bước triển khai thủ công:
```bash
# Cài đặt Railway CLI
npm i -g @railway/cli

# Đăng nhập
railway login

# Khởi tạo dự án
railway init

# Triển khai
railway up
```

Ứng dụng của bạn sẽ được triển khai tự động mỗi khi bạn push code lên repository đã kết nối.

## License

ISC # convert-docx-to-html
