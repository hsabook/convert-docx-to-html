const swaggerJSDoc = require('swagger-jsdoc');
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Swagger definition
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'HTML Zip to Base64 API',
    version: '1.0.0',
    description: 'API to extract HTML files from ZIP archives and convert embedded images to base64 format',
    contact: {
      name: 'API Support',
      url: 'https://github.com/yourusername/html-zip-to-base64-api',
      email: 'your-email@example.com'
    },
    license: {
      name: 'ISC',
      url: 'https://opensource.org/licenses/ISC'
    }
  },
  servers: [
    {
      url: BASE_URL,
      description: 'API Server'
    }
  ],
  tags: [
    {
      name: 'Conversion',
      description: 'Endpoints for HTML and image conversion'
    },
    {
      name: 'System',
      description: 'System-related endpoints'
    }
  ]
};

// Options for the swagger docs
const options = {
  swaggerDefinition,
  // Paths to files containing OpenAPI definitions
  apis: ['./api.js']
};

// Initialize swagger-jsdoc
const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec; 