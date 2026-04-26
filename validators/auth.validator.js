const { body } = require('express-validator');



// Add phone validation helper
const isValidPhone = (phone) => {
  const phoneRegex = /^\+?[0-9]{10,15}$/;
  return phoneRegex.test(phone);
};

const registerClient = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email address is required'),
  
  body('phone')
    .custom(isValidPhone)
    .withMessage('Valid phone number is required (10-15 digits, optional + prefix)'),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  
  body('fullLegalName')
    .notEmpty()
    .withMessage('Full legal name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Full legal name must be between 2 and 100 characters'),
  
  body('nin')
    .notEmpty()
    .withMessage('National Identification Number is required')
    .matches(/^[0-9]{11}$/)
    .withMessage('NIN must be 11 digits'),
  
  body('streetAddress')
    .notEmpty()
    .withMessage('Street address is required')
    .isLength({ min: 5, max: 200 })
    .withMessage('Street address must be between 5 and 200 characters'),
  
  body('serviceAddress')
    .notEmpty()
    .withMessage('Service address is required')
    .isLength({ min: 5, max: 200 })
    .withMessage('Service address must be between 5 and 200 characters')
];

const registerArtisan = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email address is required'),
  
  body('phone')
    .custom(isValidPhone)
    .withMessage('Valid phone number is required (10-15 digits, optional + prefix)'),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  
  body('fullLegalName')
    .notEmpty()
    .withMessage('Full legal name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Full legal name must be between 2 and 100 characters'),
  
  body('nin')
    .notEmpty()
    .withMessage('National Identification Number is required')
    .matches(/^[0-9]{11}$/)
    .withMessage('NIN must be 11 digits'),
  
  body('residentialAddress')
    .notEmpty()
    .withMessage('Residential address is required')
    .isLength({ min: 5, max: 200 })
    .withMessage('Residential address must be between 5 and 200 characters'),
  
  body('skillCategory')
    .notEmpty()
    .withMessage('Skill category is required')
    .isIn(['plumbing', 'electrical', 'carpentry', 'painting', 'tiling', 'hvac', 'generator', 'cctv', 'appliance', 'landscaping'])
    .withMessage('Invalid skill category'),
  
  body('onboardingFee')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Onboarding fee must be a positive number')
];


const refreshToken = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required')
];

const verifyEmail = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email address is required'),
  
  body('otp')
    .isLength({ min: 6, max: 6 })
    .matches(/^[0-9]+$/)
    .withMessage('OTP must be 6 digits')
];

const verifyPhone = [
  body('phone')
    .custom(isValidPhone)
    .withMessage('Valid phone number is required'),
  
  body('otp')
    .isLength({ min: 6, max: 6 })
    .matches(/^[0-9]+$/)
    .withMessage('OTP must be 6 digits')
];

const forgotPassword = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email address is required')
];

const resetPassword = [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required'),
  
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
];

const changePassword = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
];

const sendVerificationCode = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email address is required')
];



// Add login validation for identifier
const login = [
  body('identifier')
    .notEmpty()
    .withMessage('Email or phone number is required')
    .custom((value) => {
      const isEmail = value.includes('@') && value.includes('.');
      const isPhone = isValidPhone(value);
      if (!isEmail && !isPhone) {
        throw new Error('Please provide a valid email or phone number');
      }
      return true;
    }),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Add OTP login validation
const loginWithOTP = [
  body('phone')
    .custom(isValidPhone)
    .withMessage('Valid phone number is required'),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .matches(/^[0-9]+$/)
    .withMessage('OTP must be 6 digits')
];

// Add request OTP validation
const requestOTP = [
  body('phone')
    .custom(isValidPhone)
    .withMessage('Valid phone number is required')
];

module.exports = {
  registerClient,
  registerArtisan,
  login,
  refreshToken,
  verifyEmail,
  verifyPhone,
  forgotPassword,
  resetPassword,
  changePassword,
  sendVerificationCode,
  requestOTP,
  loginWithOTP,
};