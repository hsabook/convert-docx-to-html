const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const AdmZip = require('adm-zip');
const mammoth = require('mammoth');
const { extractZip, processHtml, removeBackslashQuotes } = require('./html_processor');

// Import processZipFile từ html_processor.js
const { processZipFile } = require('./html_processor');

/**
 * Thực hiện retry một hàm với số lần thử lại xác định
 * @param {Function} fn - Hàm cần retry
 * @param {number} maxRetries - Số lần retry tối đa
 * @param {number} retryDelay - Thời gian delay giữa các lần retry (ms)
 * @returns {Promise<any>} - Kết quả của hàm
 */
async function retryOperation(fn, maxRetries = 2, retryDelay = 5000) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`🔄 Retry attempt ${attempt}/${maxRetries}...`);
                // Delay trước khi retry
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
            
            // Thực hiện hàm
            return await fn();
        } catch (error) {
            lastError = error;
            console.error(`❌ Attempt ${attempt}/${maxRetries} failed:`, error.message);
        }
    }
    
    // Nếu đã thử hết số lần và vẫn lỗi, throw lỗi cuối cùng
    throw lastError;
}

/**
 * Convert a DOCX file to HTML with base64 encoded images
 * @param {Object} docxFile - The uploaded DOCX file
 * @returns {Promise<Object>} - The processed HTML and statistics
 */
async function convertDocxToHtml(docxFile) {
    try {
        // Create a unique temp directory for this conversion
        const tempDir = path.join(os.tmpdir(), `docx-conversion-${uuidv4()}`);
        const docxPath = path.join(tempDir, docxFile.originalname);
        const tempZipPath = path.join(tempDir, 'converted.zip');
        
        // Ensure temp directory exists
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Save the uploaded file to temp directory
        fs.writeFileSync(docxPath, docxFile.buffer);
        
        console.log(`🔄 DocxConverter convertDocxToHtml tempDir:`, tempDir);
        
        // Step 1: Call Aspose API to convert DOCX to HTML with retry
        console.log(`🔄 DocxConverter convertDocxToHtml Calling Aspose API...`);
        
        const downloadedZip = await retryOperation(
            async () => await callAsposeConversionApi(docxPath),
            2, // Tối đa retry 2 lần
            5000 // Delay 5 giây giữa các lần retry
        );
        
        if (!downloadedZip.success) {
            throw new Error(`Aspose API conversion failed: ${downloadedZip.message}`);
        }
        
        console.log(`✅ DocxConverter convertDocxToHtml Received ZIP from Aspose API`);
        
        // Step 2: Save ZIP to temp file
        fs.writeFileSync(tempZipPath, downloadedZip.data);
        
        // Step 3: Use the existing processZipFile function to handle the ZIP
        const zipBuffer = fs.readFileSync(tempZipPath);
        const result = await processZipFile(zipBuffer, path.basename(docxFile.originalname));
        
        // Step 4: Remove backslash quotes from the HTML
        if (result && result.html) {
            result.html = removeBackslashQuotes(result.html);
            console.log(`✅ DocxConverter convertDocxToHtml Removed backslash quotes from HTML`);
        }
        
        // Clean up temp files
        try {
            if (fs.existsSync(docxPath)) fs.unlinkSync(docxPath);
            if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
            if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir, { recursive: true });
        } catch (cleanupError) {
            console.error(`⚠️ DocxConverter convertDocxToHtml Cleanup error:`, cleanupError.message);
        }
        
        return result;
    } catch (error) {
        console.error(`❌ DocxConverter convertDocxToHtml Error:`, error.message);
        throw error;
    }
}

/**
 * Call Aspose API to convert DOCX to HTML and download the ZIP
 * @param {string} docxPath - Path to the DOCX file
 * @returns {Promise<Object>} - Object containing success status and ZIP data
 */
async function callAsposeConversionApi(docxPath) {
    try {
        // Create form data for API request
        const formData = new FormData();
        const fileBuffer = fs.readFileSync(docxPath);
        const fileName = path.basename(docxPath);
        
        // Add file and options to form data according to API requirements
        formData.append('1', fileBuffer, fileName);
        // Base64 encode the filename for outputFileName
        const encodedFileName = Buffer.from(fileName).toString('base64');
        formData.append('outputFileName', encodedFileName);
        formData.append('ConversionOptions', JSON.stringify({
            "UseOcr": "false",
            "Locale": "en",
            "Password": null,
            "PageRange": null
        }));
        
        // Log file size for debugging
        const fileSize = (fileBuffer.length / 1024 / 1024).toFixed(2);
        console.log(`🔄 DocxConverter callAsposeConversionApi Uploading DOCX (${fileSize} MB)...`);
        
        // Call Aspose API to upload and convert file
        const apiUrl = 'https://api.products.aspose.app/words/conversion/api/convert?outputType=HTML';
        const uploadResponse = await axios.post(apiUrl, formData, {
            headers: {
                ...formData.getHeaders(),
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Origin': 'https://products.aspose.app',
                'Referer': 'https://products.aspose.app/',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 120000
        });
        
        // Check if we got a valid response with ID
        if (!uploadResponse.data || !uploadResponse.data.id) {
            console.error(`❌ DocxConverter callAsposeConversionApi Invalid response:`, uploadResponse.data);
            return { success: false, message: 'Failed to get conversion ID from Aspose API' };
        }
        
        const convertId = uploadResponse.data.id;
        console.log(`🔄 DocxConverter callAsposeConversionApi Got conversion ID: ${convertId}`);
        
        // Download the converted ZIP file
        const downloadUrl = `https://api.products.aspose.app/words/conversion/api/Download?id=${convertId}`;
        const downloadResponse = await axios.get(downloadUrl, {
            responseType: 'arraybuffer',
            headers: {
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Origin': 'https://products.aspose.app',
                'Referer': 'https://products.aspose.app/',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
            },
            timeout: 120000
        });
        
        // Verify the response is a valid ZIP
        try {
            const zipData = downloadResponse.data;
            const zipSize = (zipData.length / 1024 / 1024).toFixed(2);
            console.log(`🔄 DocxConverter callAsposeConversionApi Downloaded ZIP (${zipSize} MB)`);
            
            // Quick verify it's a valid ZIP
            const zip = new AdmZip(Buffer.from(zipData));
            const entries = zip.getEntries();
            console.log(`🔄 DocxConverter callAsposeConversionApi ZIP contains ${entries.length} files`);
            
            return {
                success: true,
                data: zipData
            };
        } catch (zipError) {
            console.error(`❌ DocxConverter callAsposeConversionApi Invalid ZIP file:`, zipError.message);
            return { success: false, message: 'Downloaded file is not a valid ZIP' };
        }
    } catch (error) {
        console.error(`❌ DocxConverter callAsposeConversionApi Error:`, error.message);
        if (error.response) {
            console.error(`❌ DocxConverter callAsposeConversionApi Response status:`, error.response.status);
            console.error(`❌ DocxConverter callAsposeConversionApi Response data:`, error.response.data);
        }
        return { success: false, message: error.message };
    }
}

module.exports = {
    convertDocxToHtml
};