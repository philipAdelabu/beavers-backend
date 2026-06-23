// services/file.service.js
const fs = require('fs');
const path = require('path');
const { getFileUrl, deleteFile, deleteFiles } = require('../config/multer');
const { logger } = require('../config/logger');

class FileService {
  /**
   * Save file reference to database
   * @param {string} userId - User ID
   * @param {string} fileType - Type of file
   * @param {string} filePath - Path to file
   * @param {Object} metadata - Additional metadata 
   * @returns {Promise<Object>} File record
   */
  static async saveFileReference(userId, fileType, filePath, metadata = {}) {
    const { pool } = require('../config/database');
    const result = await pool.query(
      `INSERT INTO user_files (user_id, file_type, file_path, metadata, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [userId, fileType, filePath, metadata]
    );
    
    return result.rows[0];
  }

  /**
   * Get user files
   * @param {string} userId - User ID
   * @param {string} fileType - Type of file (optional)
   * @returns {Promise<Array>} User files
   */
  static async getUserFiles(userId, fileType = null) {
    const { pool } = require('../config/database');
    let query = `SELECT * FROM user_files WHERE user_id = $1`;
    const params = [userId];
    
    if (fileType) {
      query += ` AND file_type = $2`;
      params.push(fileType);
    }
    
    query += ` ORDER BY created_at DESC`;
    
    const result = await pool.query(query, params);
    
    // Convert to public URLs
    return result.rows.map(file => ({
      ...file,
      url: getFileUrl(file.file_path)
    }));
  }

  /**
   * Delete user file
   * @param {string} fileId - File record ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Success status
   */
  static async deleteUserFile(fileId, userId) {
    const { pool } = require('../config/database');
    
    const result = await pool.query(
      `SELECT file_path FROM user_files WHERE id = $1 AND user_id = $2`,
      [fileId, userId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('File not found');
    }
    
    // Delete physical file
    await deleteFile(result.rows[0].file_path);
    
    // Delete database record
    await pool.query(
      `DELETE FROM user_files WHERE id = $1 AND user_id = $2`,
      [fileId, userId]
    );
    
    return true;
  }

  /**
   * Validate file type
   * @param {string} mimeType - File MIME type
   * @param {string} category - File category (image, document, video)
   * @returns {boolean} Whether file type is valid
   */
  static validateFileType(mimeType, category) {
    const { fileTypes } = require('../config/multer');
    return fileTypes[category]?.mimeTypes.includes(mimeType) || false;
  }

  /**
   * Get file size limit
   * @param {string} category - File category
   * @returns {number} Size limit in bytes
   */
  static getFileSizeLimit(category) {
    const { fileTypes } = require('../config/multer');
    return fileTypes[category]?.maxSize || 10 * 1024 * 1024;
  }
}

module.exports = FileService;