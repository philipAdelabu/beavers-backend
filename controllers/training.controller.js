const TrainingService = require('../services/training.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { validationResult } = require('express-validator');

class TrainingController {
  // ==================== Course Management ====================
  
  static async createCourse(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const course = await TrainingService.createCourse(req.body, req.user.id);
      sendSuccess(res, course, 'Course created successfully', 201);
    } catch (error) {
      next(error);
    }
  }
  
  static async getAllCourses(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { category, tierLevel, isActive, isFeatured, search, page = 1, limit = 20 } = req.query;
      const result = await TrainingService.getAllCourses({
        category,
        tierLevel: tierLevel ? parseInt(tierLevel) : undefined,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        isFeatured: isFeatured !== undefined ? isFeatured === 'true' : undefined,
        search,
        page: parseInt(page),
        limit: parseInt(limit)
      });
      sendPaginated(res, result.courses, page, limit, result.total, 'Courses retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  static async getCoursesByTier(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { tierLevel } = req.params;
      const courses = await TrainingService.getCoursesByTier(parseInt(tierLevel));
      sendSuccess(res, courses, 'Courses retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  static async getCourseById(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const course = await TrainingService.getCourseById(req.params.courseId);
      sendSuccess(res, course, 'Course retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  static async getCourseBySlug(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const course = await TrainingService.getCourseBySlug(req.params.slug);
      sendSuccess(res, course, 'Course retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  static async updateCourse(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const course = await TrainingService.updateCourse(req.params.courseId, req.body, req.user.id);
      sendSuccess(res, course, 'Course updated successfully');
    } catch (error) {
      next(error);
    }
  }
  
  static async deleteCourse(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const course = await TrainingService.deleteCourse(req.params.courseId, req.user.id);
      sendSuccess(res, course, 'Course deleted successfully');
    } catch (error) {
      next(error);
    }
  }
  
  // ==================== Enrollments ====================
  
  static async enrollArtisan(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { courseId } = req.params;
      const { paymentReference } = req.body;
      const enrollment = await TrainingService.enrollArtisan(req.user.id, courseId, paymentReference);
      sendSuccess(res, enrollment, 'Enrolled successfully', 201);
    } catch (error) {
      next(error);
    }
  }
  
  static async getArtisanEnrollments(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { status, page = 1, limit = 20 } = req.query;
      const result = await TrainingService.getArtisanEnrollments(req.user.id, {
        status,
        page: parseInt(page),
        limit: parseInt(limit)
      });
      sendPaginated(res, result.enrollments, page, limit, result.total, 'Enrollments retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  static async getEnrollmentDetails(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const enrollment = await TrainingService.getEnrollmentDetails(req.params.enrollmentId, req.user.id);
      sendSuccess(res, enrollment, 'Enrollment details retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  // ==================== Module Progress ====================
  
  static async completeModule(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { enrollmentId } = req.params;
      const { moduleIndex, timeSpent, quizScore } = req.body;
      const result = await TrainingService.completeModule(
        enrollmentId,
        req.user.id,
        parseInt(moduleIndex),
        timeSpent || 0,
        quizScore || null
      );
      sendSuccess(res, result, 'Module completed successfully');
    } catch (error) {
      next(error);
    }
  }
  
  // ==================== Certificates ====================
  
  static async getArtisanCertificates(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await TrainingService.getArtisanCertificates(req.user.id, parseInt(page), parseInt(limit));
      sendPaginated(res, result.certificates, page, limit, result.total, 'Certificates retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  static async verifyCertificate(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { certificateNumber } = req.params;
      const result = await TrainingService.verifyCertificate(certificateNumber);
      sendSuccess(res, result, 'Certificate verification result');
    } catch (error) {
      next(error);
    }
  }
  
  // ==================== Reviews ====================
  
  static async submitReview(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { courseId } = req.params;
      const { rating, review } = req.body;
      const result = await TrainingService.submitReview(courseId, req.user.id, rating, review);
      sendSuccess(res, result, 'Review submitted successfully');
    } catch (error) {
      next(error);
    }
  }
  
  static async getCourseReviews(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { courseId } = req.params;
      const { page = 1, limit = 20 } = req.query;
      const result = await TrainingService.getCourseReviews(courseId, parseInt(page), parseInt(limit));
      sendPaginated(res, result.reviews, page, limit, result.total, 'Reviews retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  // ==================== Tier Management ====================
  
  static async getTierRequirements(req, res, next) {
    try {
      const requirements = await TrainingService.getTierRequirements();
      sendSuccess(res, requirements, 'Tier requirements retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  static async updateTierRequirements(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { tierLevel } = req.params;
      const result = await TrainingService.updateTierRequirements(parseInt(tierLevel), req.body, req.user.id);
      sendSuccess(res, result, 'Tier requirements updated');
    } catch (error) {
      next(error);
    }
  }
  
  static async checkAndUpdateTier(req, res, next) {
    try {
      const result = await TrainingService.checkAndUpdateTier(req.user.id);
      sendSuccess(res, result, 'Tier check completed');
    } catch (error) {
      next(error);
    }
  }
  
  static async getTierStatistics(req, res, next) {
    try {
      const stats = await TrainingService.getTierStatistics();
      sendSuccess(res, stats, 'Tier statistics retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  // ==================== Statistics ====================
  
  static async getCourseStatistics(req, res, next) {
    try {
      const stats = await TrainingService.getCourseStatistics();
      sendSuccess(res, stats, 'Course statistics retrieved');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = TrainingController;