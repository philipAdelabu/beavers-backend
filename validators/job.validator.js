const { body, param, query } = require('express-validator');

const createJob = [
  body('category')
    .notEmpty()
    .withMessage('Category is required')
    .isIn(['plumbing', 'electrical', 'carpentry', 'painting', 'tiling', 'hvac', 'generator', 'cctv', 'appliance', 'landscaping'])
    .withMessage('Invalid category'),
  
  body('description')
    .notEmpty()
    .withMessage('Description is required')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters'),
  
  body('mediaUrls')
    .optional()
    .isArray()
    .withMessage('Media URLs must be an array'),
  
  body('mediaUrls.*')
    .optional()
    .isURL()
    .withMessage('Each media URL must be a valid URL'),
  
  body('serviceType')
    .isIn(['inspection', 'repair', 'installation', 'emergency'])
    .withMessage('Service type must be inspection, repair, installation, or emergency'),
  
  body('location')
    .isObject()
    .withMessage('Location is required'),
  
  body('location.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  
  body('location.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180')
];

const acceptJob = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID')
];

const rejectJobOffer = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID'),
  
  body('reason')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters')
];

const confirmArrival = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID'),
  
  body('pin')
    .isLength({ min: 6, max: 6 })
    .matches(/^[0-9]+$/)
    .withMessage('PIN must be 6 digits')
];

const startDiagnostics = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID')
];

const updateDiagnosticsProgress = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID'),
  
  body('progress')
    .isInt({ min: 0, max: 100 })
    .withMessage('Progress must be between 0 and 100'),
  
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

const stopDiagnostics = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID'),
  
  body('executionMode')
    .isIn(['time_based', 'quoted'])
    .withMessage('Execution mode must be time_based or quoted'),
  
  body('findings')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Findings cannot exceed 1000 characters')
];

const startExecution = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID')
];

const pauseExecution = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID'),
  
  body('reason')
    .notEmpty()
    .withMessage('Pause reason is required')
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters'),
  
  body('duration')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Duration must be a positive integer (minutes)')
];

const resumeExecution = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID')
];

const stopExecution = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID')
];

const submitQuote = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID'),
  
  body('quoteAmount')
    .isFloat({ min: 0 })
    .withMessage('Quote amount must be a positive number'),
  
  body('quoteDetails')
    .notEmpty()
    .withMessage('Quote details are required')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Quote details must be between 10 and 1000 characters'),
  
  body('estimatedDuration')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Estimated duration must be a positive integer (minutes)')
];

const approveQuote = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID')
];

const rejectQuote = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID'),
  
  body('reason')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters'),
  
  body('counterOffer')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Counter offer must be a positive number')
];

const completeJob = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID'),
  
  body('completionNotes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Completion notes cannot exceed 1000 characters')
];

const cancelJob = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID'),
  
  body('reason')
    .notEmpty()
    .withMessage('Cancellation reason is required')
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters')
];

const getJobDetails = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID')
];

const getClientJobs = [
  query('status')
    .optional()
    .isIn(['pending', 'accepted', 'arrived', 'diagnostics', 'execution', 'completed', 'cancelled'])
    .withMessage('Invalid job status'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

const getArtisanJobs = [
  query('status')
    .optional()
    .isIn(['pending', 'accepted', 'arrived', 'diagnostics', 'execution', 'completed', 'cancelled'])
    .withMessage('Invalid job status'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

const getJobTimeline = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID')
];

const rateJob = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID'),
  
  body('artisanId')
    .isUUID()
    .withMessage('Invalid artisan ID'),
  
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  
  body('review')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Review cannot exceed 500 characters'),
  
  body('categories')
    .optional()
    .isObject()
    .withMessage('Categories must be an object')
];

const reportIssue = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID'),
  
  body('issueType')
    .isIn(['poor_workmanship', 'damage_to_property', 'overcharging', 'unauthorized_work', 'other'])
    .withMessage('Invalid issue type'),
  
  body('description')
    .notEmpty()
    .withMessage('Issue description is required')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  
  body('photos')
    .optional()
    .isArray()
    .withMessage('Photos must be an array')
];

module.exports = {
  createJob,
  acceptJob,
  rejectJobOffer,
  confirmArrival,
  startDiagnostics,
  updateDiagnosticsProgress,
  stopDiagnostics,
  startExecution,
  pauseExecution,
  resumeExecution,
  stopExecution,
  submitQuote,
  approveQuote,
  rejectQuote,
  completeJob,
  cancelJob,
  getJobDetails,
  getClientJobs,
  getArtisanJobs,
  getJobTimeline,
  rateJob,
  reportIssue
};