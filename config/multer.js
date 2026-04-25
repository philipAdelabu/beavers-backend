const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('./logger');
const sharp = require('sharp'); // For image optimization

// Ensure upload directories exist
const uploadDir = path.join(__dirname, '../uploads');
const subDirs = {
  'profile-photos': 'profile-photos',
  'verification-docs': 'verification-docs', 
  'job-photos': 'job-photos',
  'invoices': 'invoices',
  'temp': 'temp',
  'certificates': 'certificates',
  'disputes': 'disputes',
  'nin-photos': 'nin-photos',
  'utility-bills': 'utility-bills',
  'passport-photos': 'passport-photos'
};

Object.values(subDirs).forEach(dir => {
  const dirPath = path.join(uploadDir, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.info(`Created upload directory: ${dirPath}`);
  }
});

// File type configuration
const fileTypes = {
  images: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/heic', 'image/heif'],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.heif'],
    maxSize: 5 * 1024 * 1024, // 5MB
    processor: async (inputPath, outputPath) => {
      await sharp(inputPath)
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(outputPath);
    }
  },
  documents: {
    mimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    extensions: ['.pdf', '.doc', '.docx'],
    maxSize: 10 * 1024 * 1024, // 10MB
    processor: null
  },
  videos: {
    mimeTypes: ['video/mp4', 'video/mpeg', 'video/quicktime'],
    extensions: ['.mp4', '.mpeg', '.mov'],
    maxSize: 50 * 1024 * 1024, // 50MB
    processor: null
  }
};

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'temp';
    
    if (file.fieldname === 'profilePhoto' || file.fieldname === 'passportPhoto') {
      folder = 'profile-photos';
    } else if (file.fieldname === 'ninPhoto') {
      folder = 'nin-photos';
    } else if (file.fieldname === 'utilityBill') {
      folder = 'utility-bills';
    } else if (file.fieldname.includes('document') || file.fieldname.includes('verification')) {
      folder = 'verification-docs';
    } else if (file.fieldname === 'certificate' || file.fieldname === 'certificates') {
      folder = 'certificates';
    } else if (file.fieldname === 'jobPhoto' || file.fieldname === 'evidence' || file.fieldname === 'jobImages') {
      folder = 'job-photos';
    } else if (file.fieldname === 'invoice') {
      folder = 'invoices';
    } else if (file.fieldname === 'disputeEvidence') {
      folder = 'disputes';
    }
    
    cb(null, path.join(uploadDir, folder));
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allAllowedTypes = [
    ...fileTypes.images.mimeTypes,
    ...fileTypes.documents.mimeTypes,
    ...fileTypes.videos.mimeTypes
  ];
  
  if (allAllowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed. Allowed types: images (JPG, PNG, GIF), documents (PDF, DOC), videos (MP4)`));
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
    files: 20
  },
  fileFilter: fileFilter
});

/**
 * Process uploaded image (optimize and resize)
 * @param {string} filePath - Path to uploaded file
 * @returns {Promise<string>} Path to processed file
 */
const processImage = async (filePath) => {
  const parsedPath = path.parse(filePath);
  const optimizedPath = path.join(parsedPath.dir, `${parsedPath.name}_optimized${parsedPath.ext}`);
  
  try {
    await sharp(filePath)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: true })
      .toFile(optimizedPath);
    
    // Replace original with optimized version
    fs.unlinkSync(filePath);
    fs.renameSync(optimizedPath, filePath);
    
    return filePath;
  } catch (error) {
    logger.error('Image processing error:', error);
    return filePath;
  }
};

/**
 * Delete file from storage
 * @param {string} filePath - Path to file
 * @returns {Promise<boolean>} Success status
 */
const deleteFile = async (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`File deleted: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Error deleting file:', error);
    return false;
  }
};

/**
 * Get file URL
 * @param {string} filePath - File path
 * @returns {string} Public URL
 */
const getFileUrl = (filePath) => {
  if (!filePath) return null;
  const relativePath = path.relative(uploadDir, filePath);
  return `${process.env.APP_URL || 'http://localhost:3000'}/uploads/${relativePath}`;
};

/**
 * Batch delete files
 * @param {Array} filePaths - Array of file paths
 * @returns {Promise<Object>} Deletion results
 */
const deleteFiles = async (filePaths) => {
  const results = [];
  for (const filePath of filePaths) {
    const result = await deleteFile(filePath);
    results.push({ path: filePath, success: result });
  }
  return results;
};

/**
 * Clean up old temporary files
 */
const cleanupTempFiles = () => {
  const tempDir = path.join(uploadDir, 'temp');
  if (fs.existsSync(tempDir)) {
    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > oneHour) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (error) {
        logger.error(`Error cleaning up file ${file}:`, error);
      }
    }
    
    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} temporary files`);
    }
  }
};

// Run cleanup every hour
setInterval(cleanupTempFiles, 60 * 60 * 1000);

// Middleware for single file upload
const uploadSingle = (fieldName) => {
  return async (req, res, next) => {
    const singleUpload = upload.single(fieldName);
    singleUpload(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'FILE_TOO_LARGE') {
          return res.status(400).json({ error: `File too large. Maximum size is 50MB.` });
        }
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      
      // Process image if uploaded
      if (req.file && fileTypes.images.mimeTypes.includes(req.file.mimetype)) {
        try {
          await processImage(req.file.path);
        } catch (error) {
          logger.error('Image processing failed:', error);
        }
      }
      
      next();
    });
  };
};

// Middleware for multiple file upload
const uploadMultiple = (fieldName, maxCount = 10) => {
  return async (req, res, next) => {
    const multipleUpload = upload.array(fieldName, maxCount);
    multipleUpload(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'FILE_TOO_LARGE') {
          return res.status(400).json({ error: `File too large. Maximum size is 50MB.` });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({ error: `Too many files. Maximum ${maxCount} files allowed.` });
        }
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      
      // Process images if uploaded
      if (req.files) {
        for (const file of req.files) {
          if (fileTypes.images.mimeTypes.includes(file.mimetype)) {
            try {
              await processImage(file.path);
            } catch (error) {
              logger.error('Image processing failed:', error);
            }
          }
        }
      }
      
      next();
    });
  };
};

// Middleware for multiple fields
const uploadFields = (fields) => {
  return async (req, res, next) => {
    const fieldsUpload = upload.fields(fields);
    fieldsUpload(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'FILE_TOO_LARGE') {
          return res.status(400).json({ error: `File too large. Maximum size is 50MB.` });
        }
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      
      // Process uploaded images
      if (req.files) {
        for (const field of Object.values(req.files)) {
          for (const file of field) {
            if (fileTypes.images.mimeTypes.includes(file.mimetype)) {
              try {
                await processImage(file.path);
              } catch (error) {
                logger.error('Image processing failed:', error);
              }
            }
          }
        }
      }
      
      next();
    });
  };
};

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  uploadFields,
  deleteFile,
  deleteFiles,
  getFileUrl,
  cleanupTempFiles,
  processImage,
  fileTypes
};