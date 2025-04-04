const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const cheerio = require('cheerio');
const mime = require('mime-types');
const { v4: uuidv4 } = require('uuid');

/**
 * Extract zip file to specified directory
 * @param {string} zipFilePath - Path to zip file
 * @param {string} extractPath - Directory to extract to
 * @returns {string} - Extract path
 */
function extractZip(zipFilePath, extractPath) {
  try {
    const zip = new AdmZip(zipFilePath);
    zip.extractAllTo(extractPath, true);
    console.log(`🗂️ extractZip - Extracted to ${extractPath}`);
    return extractPath;
  } catch (error) {
    console.error(`❌ extractZip - Error extracting zip:`, error);
    throw error;
  }
}

/**
 * Convert image file to base64 string
 * @param {string} imagePath - Path to image file
 * @returns {Promise<string>} - Base64 string with data URI
 */
async function imageToBase64(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const mimeType = mime.lookup(imagePath) || 'image/jpeg';
    const base64Image = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
    console.log(`🔄 imageToBase64 - Converted: ${imagePath}`);
    return base64Image;
  } catch (error) {
    console.error(`❌ imageToBase64 - Error converting ${imagePath}:`, error);
    return null;
  }
}

/**
 * Remove backslash quotes (\\") from HTML content
 * @param {string} htmlContent - HTML content with backslash quotes
 * @returns {string} - HTML content with backslash quotes removed
 */
function removeBackslashQuotes(htmlContent) {
  try {
    // Replace all \" with "
    const cleanedHtml = htmlContent.replace(/\\"/g, '"');
    console.log(`✅ removeBackslashQuotes - Successfully removed backslash quotes`);
    return cleanedHtml;
  } catch (error) {
    console.error(`❌ removeBackslashQuotes - Error removing backslash quotes:`, error);
    return htmlContent; // Return original content on error
  }
}

/**
 * Process HTML file to replace image paths with base64
 * @param {string} htmlFilePath - Path to HTML file
 * @returns {Promise<string>} - Processed HTML content
 */
async function processHtml(htmlFilePath) {
  try {
    let htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
    
    // First, remove backslash quotes
    htmlContent = removeBackslashQuotes(htmlContent);
    
    const $ = cheerio.load(htmlContent);
    
    // Process all img tags
    const imgPromises = [];
    $('img').each((index, element) => {
      const imgSrc = $(element).attr('src');
      
      if (imgSrc && !imgSrc.startsWith('data:')) {
        // Resolve the image path relative to the HTML file
        const imgPath = path.resolve(path.dirname(htmlFilePath), imgSrc);
        
        // Add to the promises array
        const promise = imageToBase64(imgPath).then(base64Img => {
          if (base64Img) {
            $(element).attr('src', base64Img);
          }
        });
        
        imgPromises.push(promise);
      }
    });
    
    // Process all CSS background images
    $('*').each((index, element) => {
      const style = $(element).attr('style');
      if (style && style.includes('background-image')) {
        // Simple regex to extract URLs
        const urlMatch = style.match(/url\(['"]?([^'"]+)['"]?\)/);
        if (urlMatch && urlMatch[1] && !urlMatch[1].startsWith('data:')) {
          const imgPath = path.resolve(path.dirname(htmlFilePath), urlMatch[1]);
          
          const promise = imageToBase64(imgPath).then(base64Img => {
            if (base64Img) {
              const newStyle = style.replace(urlMatch[0], `url(${base64Img})`);
              $(element).attr('style', newStyle);
            }
          });
          
          imgPromises.push(promise);
        }
      }
    });
    
    // Wait for all image conversions to complete
    await Promise.all(imgPromises);
    
    // Get the processed HTML
    const processedHtml = $.html();
    console.log(`✅ processHtml - Completed processing ${htmlFilePath}`);
    return processedHtml;
  } catch (error) {
    console.error(`❌ processHtml - Error processing HTML:`, error);
    throw error;
  }
}

/**
 * Verify HTML contains base64 images
 * @param {string} htmlContent - HTML content to verify
 * @returns {object} - Verification results
 */
function verifyBase64Images(htmlContent) {
  // Count occurrences of base64 images
  const base64Count = (htmlContent.match(/data:image\/[^;]+;base64,/g) || []).length;
  
  // Find all img tags
  const imgTagCount = (htmlContent.match(/<img[^>]+>/g) || []).length;
  
  return {
    fileSize: (htmlContent.length / 1024 / 1024).toFixed(2) + ' MB',
    base64ImagesCount: base64Count,
    imgTagsCount: imgTagCount,
    success: base64Count > 0
  };
}

/**
 * Process zip file containing HTML and images
 * @param {string} zipFilePath - Path to zip file
 * @param {string} outputDir - Directory to save processed files
 * @returns {Promise<object>} - Results of processing
 */
async function processZipWithHtml(zipFilePath, outputDir = './output') {
  const extractPath = path.join(outputDir, 'extracted');
  const results = {
    extractedFiles: [],
    processedFiles: [],
    stats: {}
  };
  
  try {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Extract zip file
    extractZip(zipFilePath, extractPath);
    
    // Find all HTML files
    const files = fs.readdirSync(extractPath);
    const htmlFiles = files.filter(file => path.extname(file).toLowerCase() === '.html');
    
    if (htmlFiles.length === 0) {
      throw new Error('No HTML files found in the zip archive');
    }
    
    results.extractedFiles = htmlFiles;
    
    // Process each HTML file
    for (const htmlFile of htmlFiles) {
      const htmlFilePath = path.join(extractPath, htmlFile);
      const processedHtml = await processHtml(htmlFilePath);
      
      // Verify processed HTML
      const verificationResults = verifyBase64Images(processedHtml);
      
      // Write the processed HTML to a new file
      const outputFileName = `processed_${htmlFile}`;
      const outputPath = path.join(outputDir, outputFileName);
      fs.writeFileSync(outputPath, processedHtml, 'utf8');
      
      results.processedFiles.push({
        originalFile: htmlFile,
        processedFile: outputFileName,
        outputPath: outputPath,
        stats: verificationResults
      });
    }
    
    console.log(`✅ processZipWithHtml - Successfully processed ${results.processedFiles.length} files`);
    return results;
  } catch (error) {
    console.error(`❌ processZipWithHtml - Error:`, error);
    throw error;
  }
}

// Main function to run the process
async function main() {
  const zipFilePath = 'html.zip';
  const outputDir = './output';
  
  try {
    // Process the zip file
    const results = await processZipWithHtml(zipFilePath, outputDir);
    
    // Print summary
    console.log('\n===== PROCESSING SUMMARY =====\n');
    console.log(`Zip file: ${zipFilePath}`);
    console.log(`Output directory: ${outputDir}`);
    console.log(`HTML files found: ${results.extractedFiles.length}`);
    console.log(`HTML files processed: ${results.processedFiles.length}`);
    
    // Print details for each processed file
    results.processedFiles.forEach(file => {
      console.log(`\nFile: ${file.originalFile}`);
      console.log(`  Processed to: ${file.outputPath}`);
      console.log(`  Size: ${file.stats.fileSize}`);
      console.log(`  Images converted to base64: ${file.stats.base64ImagesCount}/${file.stats.imgTagsCount}`);
      console.log(`  Status: ${file.stats.success ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    });
    
    console.log('\n===== END OF SUMMARY =====\n');
    
    // Return the path to the processed HTML file
    return results.processedFiles.length > 0 ? results.processedFiles[0].outputPath : null;
  } catch (error) {
    console.error('❌ main - Error in processing:', error);
    return null;
  }
}

// Run the main function if this script is executed directly
if (require.main === module) {
  main();
} else {
  // Export functions for use in other scripts
  module.exports = {
    extractZip,
    imageToBase64,
    processHtml,
    verifyBase64Images,
    processZipWithHtml,
    removeBackslashQuotes,
    processZipFile: async function(zipFilePath) {
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
          html: processedHtml.replace(/\\"/g, '"'),
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
  };
} 