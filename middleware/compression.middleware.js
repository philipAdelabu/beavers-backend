const compression = require('compression');

// Compression options
const compressionOptions = {
  // Only compress responses larger than 1KB
  threshold: 1024,
  
  // Filter function to determine what to compress
  filter: (req, res) => {
    // Don't compress for IE6
    if (req.headers['user-agent'] && /MSIE 6/.test(req.headers['user-agent'])) {
      return false;
    }
    
    // Compress everything except eventsource and images
    const contentType = res.getHeader('Content-Type');
    if (contentType) {
      const skipTypes = ['image/', 'video/', 'audio/', 'application/octet-stream'];
      for (const type of skipTypes) {
        if (contentType.includes(type)) {
          return false;
        }
      }
    }
    
    return compression.filter(req, res);
  },
  
  // Compression level (0-9, where 9 is maximum compression but slower)
  level: process.env.NODE_ENV === 'production' ? 6 : 1,
  
  // Chunk size for streaming
  chunkSize: 16384, // 16KB
  
  // Memory level (1-9)
  memLevel: 8,
  
  // Window bits (8-15)
  windowBits: 15,
  
  // Strategy for compression (0-4)
  strategy: 0
};

// Brotli compression (better than gzip for text)
const brotliOptions = {
  params: {
    [require('zlib').constants.BROTLI_PARAM_MODE]: require('zlib').constants.BROTLI_MODE_TEXT,
    [require('zlib').constants.BROTLI_PARAM_QUALITY]: process.env.NODE_ENV === 'production' ? 6 : 1,
    [require('zlib').constants.BROTLI_PARAM_SIZE_HINT]: 0
  }
};

// Check if client supports brotli
const shouldUseBrotli = (req) => {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  return acceptEncoding.includes('br');
};

// Dynamic compression middleware that chooses best algorithm
const compressionMiddleware = (req, res, next) => {
  if (shouldUseBrotli(req)) {
    // Use brotli compression
    const brotli = compression(brotliOptions);
    return brotli(req, res, next);
  }
  
  // Use gzip/deflate compression
  return compression(compressionOptions)(req, res, next);
};

// Skip compression for specific routes
const skipCompression = (req, res, next) => {
  const skipPaths = ['/health', '/metrics', '/uploads'];
  if (skipPaths.some(path => req.path.startsWith(path))) {
    return next();
  }
  compressionMiddleware(req, res, next);
};

module.exports = {
  compressionMiddleware: skipCompression,
  compressionOptions,
  brotliOptions
};