const express = require('express');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const cron = require('node-cron');

// Import functions from html_processor
const { 
  extractZip, 
  processHtml, 
  verifyBase64Images 
} = require('./html_processor');

// Import DOCX converter
const { convertDocxToHtml } = require('./docx_converter');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max upload
  useTempFiles: true,
  tempFileDir: './tmp/'
}));

// Serve static files from the public directory
app.use(express.static('public'));

// Setup Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Create temporary directory if it doesn't exist
if (!fs.existsSync('./tmp')) {
  fs.mkdirSync('./tmp', { recursive: true });
}

// Setup a cron job to clean up tmp directory every 5 minutes
cron.schedule('*/5 * * * *', () => {
  console.log('Running cleanup job for tmp directory...');
  const tmpDir = path.join(__dirname, 'tmp');
  
  // Create recursive function to clean directories
  const cleanDirectory = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
      console.log(`Directory does not exist: ${dirPath}`);
      return;
    }
    
    try {
      const files = fs.readdirSync(dirPath);
      
      files.forEach(file => {
        const filePath = path.join(dirPath, file);
        
        try {
          const stats = fs.statSync(filePath);
          const now = new Date().getTime();
          const fileAge = now - stats.mtime.getTime();
          const fileAgeMinutes = fileAge / (1000 * 60);
          
          // Only delete files older than 30 minutes
          if (fileAgeMinutes > 30) {
            if (stats.isDirectory()) {
              // Clean directory contents first, then remove directory
              cleanDirectory(filePath);
              try {
                fs.rmdirSync(filePath);
                console.log(`Deleted tmp directory: ${file}`);
              } catch (rmErr) {
                // Directory might not be empty or might be in use
                console.log(`Could not remove directory ${file}: ${rmErr.message}`);
              }
            } else if (stats.isFile()) {
              try {
                fs.unlinkSync(filePath);
                console.log(`Deleted tmp file: ${file}`);
              } catch (unlinkErr) {
                // File might be in use
                console.log(`Could not delete file ${file}: ${unlinkErr.message}`);
              }
            }
          }
        } catch (statErr) {
          console.error(`Error getting stats for ${file}: ${statErr.message}`);
        }
      });
    } catch (readErr) {
      console.error(`Error reading directory ${dirPath}: ${readErr.message}`);
    }
  };
  
  // Start the cleaning process
  cleanDirectory(tmpDir);
});

/**
 * Process ZIP file and convert images to base64
 * @param {string} zipFilePath - Path to the uploaded ZIP file
 * @returns {Promise<Object>} - Object containing the processed HTML and stats
 */
async function processZipFile(zipFilePath) {
  // Create unique working directory for this request
  const requestId = uuidv4();
  const workDir = path.join('./tmp', requestId);
  const extractPath = path.join(workDir, 'extracted');
  
  try {
    // Create working directories
    fs.mkdirSync(workDir, { recursive: true });
    
    // Extract the zip file
    extractZip(zipFilePath, extractPath);
    
    // Find HTML files
    const files = fs.readdirSync(extractPath);
    const htmlFiles = files.filter(file => path.extname(file).toLowerCase() === '.html');
    
    if (htmlFiles.length === 0) {
      throw new Error('No HTML files found in the ZIP archive');
    }
    
    // Process the first HTML file found
    const htmlFilePath = path.join(extractPath, htmlFiles[0]);
    const processedHtml = await processHtml(htmlFilePath);
    
    // Verify the processed HTML
    const verificationResults = verifyBase64Images(processedHtml);
    
    return {
      html: processedHtml,
      stats: {
        fileName: htmlFiles[0],
        fileSize: verificationResults.fileSize,
        imagesConverted: verificationResults.base64ImagesCount,
        totalImages: verificationResults.imgTagsCount,
        success: verificationResults.success
      }
    };
  } catch (error) {
    throw error;
  } finally {
    // Clean up - remove the working directory regardless of success/failure
    // Note: using setTimeout to ensure file handles are closed
    setTimeout(() => {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch (err) {
        console.error('Error cleaning up temporary files:', err);
      }
    }, 1000);
  }
}

/**
 * @swagger
 * /api/convert:
 *   post:
 *     summary: Convert images in a ZIP file containing HTML to base64
 *     description: Extracts a ZIP file, finds HTML files, and converts all image references to base64 format
 *     tags: [Conversion]
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - zipFile
 *             properties:
 *               zipFile:
 *                 type: string
 *                 format: binary
 *                 description: ZIP file containing HTML and image files
 *     responses:
 *       200:
 *         description: Successfully processed HTML
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: HTML processed successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     html:
 *                       type: string
 *                       description: The processed HTML with base64 images
 *                     stats:
 *                       type: object
 *                       properties:
 *                         fileName:
 *                           type: string
 *                           example: index.html
 *                         fileSize:
 *                           type: string
 *                           example: 0.82 MB
 *                         imagesConverted:
 *                           type: integer
 *                           example: 42
 *                         totalImages:
 *                           type: integer
 *                           example: 42
 *                         success:
 *                           type: boolean
 *                           example: true
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: No ZIP file uploaded
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Error processing ZIP file
 */
app.post('/api/convert', async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.files || !req.files.zipFile) {
      return res.status(400).json({ 
        success: false, 
        message: 'No ZIP file uploaded' 
      });
    }
    
    const zipFile = req.files.zipFile;
    
    // Validate file type
    if (!zipFile.name.endsWith('.zip')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Uploaded file must be a ZIP archive' 
      });
    }
    
    // Process the ZIP file
    const result = await processZipFile(zipFile.tempFilePath);
    
    // Return the processed HTML
    return res.status(200).json({
      success: true,
      message: 'HTML processed successfully',
      data: {
        html: result.html,
        stats: result.stats
      }
    });
  } catch (error) {
    console.error('Error processing ZIP file:', error);
    return res.status(500).json({
      success: false,
      message: `Error processing ZIP file: ${error.message}`
    });
  }
});

/**
 * @swagger
 * /api/docx-to-html:
 *   post:
 *     summary: Convert DOCX file to HTML with base64 images
 *     description: Uploads DOCX to Aspose API, gets a ZIP, then converts all images to base64 format
 *     tags: [Conversion]
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - docxFile
 *             properties:
 *               docxFile:
 *                 type: string
 *                 format: binary
 *                 description: DOCX file to convert to HTML with base64 images
 *     responses:
 *       200:
 *         description: Successfully processed DOCX to HTML
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: DOCX processed successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     html:
 *                       type: string
 *                       description: The processed HTML with base64 images
 *                     stats:
 *                       type: object
 *                       properties:
 *                         fileName:
 *                           type: string
 *                           example: index.html
 *                         fileSize:
 *                           type: string
 *                           example: 0.82 MB
 *                         imagesConverted:
 *                           type: integer
 *                           example: 42
 *                         totalImages:
 *                           type: integer
 *                           example: 42
 *                         success:
 *                           type: boolean
 *                           example: true
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: No DOCX file uploaded
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Error processing DOCX file
 */
app.post('/api/docx-to-html', async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.files || !req.files.docxFile) {
      return res.status(400).json({ 
        success: false, 
        message: 'No DOCX file uploaded' 
      });
    }
    
    const docxFile = req.files.docxFile;
    
    // Validate file type
    if (!docxFile.name.endsWith('.docx')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Uploaded file must be a DOCX document' 
      });
    }
    
    // Create file object with buffer and originalname properties
    // needed for our docx_converter implementation
    const fileObj = {
      buffer: fs.readFileSync(docxFile.tempFilePath),
      originalname: docxFile.name
    };
    
    // Process the DOCX file
    const result = await convertDocxToHtml(fileObj);
    
    // Return the processed HTML
    return res.status(200).json({
      success: true,
      message: 'DOCX processed successfully',
      data: {
        html: result.html,
        stats: result.stats
      }
    });
  } catch (error) {
    console.error('Error processing DOCX file:', error);
    return res.status(500).json({
      success: false,
      message: `Error processing DOCX file: ${error.message}`
    });
  }
});

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Check API health
 *     description: Returns the current status of the API
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: OK
 *                 message:
 *                   type: string
 *                   example: API is running
 */
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'API is running' });
});

// Root route redirects to the HTML interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * @swagger
 * /api/swagger.json:
 *   get:
 *     summary: Get Swagger specification
 *     description: Returns the Swagger specification in JSON format
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Swagger specification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
app.get('/api/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔗 API endpoint (ZIP): http://localhost:${PORT}/api/convert`);
  console.log(`🔗 API endpoint (DOCX): http://localhost:${PORT}/api/docx-to-html`);
  console.log(`📚 API documentation: http://localhost:${PORT}/api-docs`);
  console.log(`🌐 Web interface: http://localhost:${PORT}/`);
  console.log(`🔍 Health check: http://localhost:${PORT}/api/health`);
}); 