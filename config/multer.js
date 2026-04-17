const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('./logger');

// Ensure upload directories exist
const uploadDir = path.join(__dirname, '../uploads');
const subDirs = ['profile-photos', 'verification-docs', 'job-photos', 'invoices', 'temp', 'certificates', 'disputes'];

subDirs.forEach(dir => {
  const dirPath = path.join(uploadDir, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.info(`Created upload directory: ${dirPath}`);
  }
});

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'temp';
    
    if (file.fieldname === 'profilePhoto' || file.fieldname === 'passportPhoto') {
      folder = 'profile-photos';
    } else if (file.fieldname.includes('document') || file.fieldname.includes('verification')) {
      folder = 'verification-docs';
    } else if (file.fieldname === 'jobPhoto' || file.fieldname === 'evidence' || file.fieldname === 'jobImages') {
      folder = 'job-photos';
    } else if (file.fieldname === 'invoice') {
      folder = 'invoices';
    } else if (file.fieldname === 'certificate') {
      folder = 'certificates';
    } else if (file.fieldname === 'disputeEvidence') {
      folder = 'disputes';
    }
    
    cb(null, path.join(uploadDir, folder));
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|heic|mp4|mov|avi/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed. Allowed types: images, PDF, DOC, MP4`));
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'), // 50MB default
    files: parseInt(process.env.MAX_FILES_PER_UPLOAD || '20')
  },
  fileFilter: fileFilter
});

/**
 * Single file upload middleware
 * @param {string} fieldName - Field name
 * @returns {Function} Multer middleware
 */
const uploadSingle = (fieldName) => {
  return (req, res, next) => {
    const singleUpload = upload.single(fieldName);
    singleUpload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'FILE_TOO_LARGE') {
          return res.status(400).json({ error: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE / 1024 / 1024}MB.` });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({ error: `Too many files. Maximum ${process.env.MAX_FILES_PER_UPLOAD} files allowed.` });
        }
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  };
};

/**
 * Multiple file upload middleware
 * @param {string} fieldName - Field name
 * @param {number} maxCount - Maximum number of files
 * @returns {Function} Multer middleware
 */
const uploadMultiple = (fieldName, maxCount = 10) => {
  return (req, res, next) => {
    const multipleUpload = upload.array(fieldName, maxCount);
    multipleUpload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'FILE_TOO_LARGE') {
          return res.status(400).json({ error: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE / 1024 / 1024}MB.` });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({ error: `Too many files. Maximum ${maxCount} files allowed.` });
        }
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  };
};

/**
 * Multiple fields upload middleware
 * @param {Array} fields - Array of field configurations
 * @returns {Function} Multer middleware
 */
const uploadFields = (fields) => {
  return (req, res, next) => {
    const fieldsUpload = upload.fields(fields);
    fieldsUpload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'FILE_TOO_LARGE') {
          return res.status(400).json({ error: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE / 1024 / 1024}MB.` });
        }
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  };
};

// Specific upload configurations
const uploadProfilePhoto = uploadSingle('profilePhoto');
const uploadVerificationDocs = uploadFields([
  { name: 'ninPhoto', maxCount: 1 },
  { name: 'passportPhoto', maxCount: 1 },
  { name: 'utilityBill', maxCount: 1 },
  { name: 'certificates', maxCount: 10 }
]);
const uploadJobPhotos = uploadMultiple('jobPhotos', 10);
const uploadDisputeEvidence = uploadMultiple('evidence', 10);

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

/**
 * Delete file from storage
 * @param {string} filePath - Path to file
 * @returns {Promise<boolean>} Success status
 */
const deleteFile = async (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
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
 * @returns {string} File URL
 */
const getFileUrl = (filePath) => {
  if (!filePath) return null;
  const relativePath = path.relative(uploadDir, filePath);
  return `${process.env.APP_URL}/uploads/${relativePath}`;
};

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  uploadFields,
  uploadProfilePhoto,
  uploadVerificationDocs,
  uploadJobPhotos,
  uploadDisputeEvidence,
  cleanupTempFiles,
  deleteFile,
  getFileUrl
};