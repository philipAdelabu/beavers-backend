// ============================================
// Application Constants
// ============================================

    
  // User Types
  const USER_TYPES = {
    CLIENT: 'client',
    ARTISAN: 'artisan',
    ADMIN: 'admin'
  };

// Job Status
const JOB_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  ARRIVED: 'arrived',
  DIAGNOSTICS: 'diagnostics',
  AWAITING_EXECUTION_APPROVAL: 'awaiting_execution_approval',
  EXECUTION: 'execution',
  PAUSED: 'paused',
  PENDING_QUOTE_APPROVAL: 'pending_quote_approval',
  QUOTE_APPROVED: 'quote_approved',
  QUOTE_REJECTED: 'quote_rejected',
  AWAITING_COMPLETION_CONFIRMATION: 'awaiting_completion_confirmation',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FAILED_MATCHING: 'failed_matching'
};

// Service Types
const SERVICE_TYPES = {
  INSPECTION: 'inspection',
  REPAIR: 'repair',
  INSTALLATION: 'installation',
  EMERGENCY: 'emergency'
};

// Billing Modes
const BILLING_MODES = {
  TIME_BASED: 'time_based',
  QUOTED: 'quoted'
};

// Billing Status
const BILLING_STATUS = {
  PENDING: 'pending',
  BASE_CHARGED: 'base_charged',
  DIAGNOSTICS_CHARGED: 'diagnostics_charged',
  EXECUTION_CHARGED: 'execution_charged',
  AWAITING_PAYMENT: 'awaiting_payment',
  PAID: 'paid',
  REFUNDED: 'refunded',
  DISPUTED: 'disputed'
};

// Artisan Tiers
const ARTISAN_TIERS = {
  TIER_1: 1,
  TIER_2: 2,
  TIER_3: 3
};

// Artisan Tier Names
const ARTISAN_TIER_NAMES = {
  1: 'Basic',
  2: 'Qualified',
  3: 'Professional'
};

// Verification Status
const VERIFICATION_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected'
};

// Payment Status
const PAYMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  DISPUTED: 'disputed'
};

// Escrow Transaction Types
const ESCROW_TRANSACTION_TYPES = {
  BASE_FEE: 'base_fee',
  DIAGNOSTICS_FEE: 'diagnostics_fee',
  EXECUTION_FEE: 'execution_fee',
  MATERIALS: 'materials',
  WORKMANSHIP: 'workmanship',
  PLATFORM_FEE: 'platform_fee',
  FULL_PAYMENT: 'full_payment'
};

// Escrow Status
const ESCROW_STATUS = {
  HELD: 'held',
  FROZEN: 'frozen',
  RELEASED: 'released',
  REFUNDED: 'refunded'
};

// Dispute Status
const DISPUTE_STATUS = {
  PENDING: 'pending',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled'
};

// Dispute Reasons
const DISPUTE_REASONS = {
  WORK_NOT_COMPLETED: 'work_not_completed',
  POOR_WORKMANSHIP: 'poor_workmanship',
  DAMAGE_TO_PROPERTY: 'damage_to_property',
  OVERCHARGING: 'overcharging',
  UNAUTHORIZED_WORK: 'unauthorized_work',
  OTHER: 'other'
};

// Notification Types
const NOTIFICATION_TYPES = {
  JOB_OFFER: 'job_offer',
  JOB_ACCEPTED: 'job_accepted',
  JOB_COMPLETED: 'job_completed',
  JOB_CANCELLED: 'job_cancelled',
  ARRIVAL: 'arrival',
  PAYMENT_CONFIRMED: 'payment_confirmed',
  PAYMENT_FAILED: 'payment_failed',
  REFUND_PROCESSED: 'refund_processed',
  DISPUTE_UPDATE: 'dispute_update',
  VERIFICATION: 'verification',
  PROMOTION: 'promotion',
  SYSTEM: 'system'
};

// Notification Channels
const NOTIFICATION_CHANNELS = {
  EMAIL: 'email',
  SMS: 'sms',
  PUSH: 'push'
};

// Dispatch Status
const DISPATCH_STATUS = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled'
};

// BOQ Status
const BOQ_STATUS = {
  DRAFT: 'draft',
  PENDING_CLIENT_APPROVAL: 'pending_client_approval',
  PENDING_ADMIN_APPROVAL: 'pending_admin_approval',
  APPROVED: 'approved',
  REJECTED_BY_CLIENT: 'rejected_by_client',
  REJECTED_BY_ADMIN: 'rejected_by_admin'
};

// Cache Keys
const CACHE_KEYS = {
  USER_SESSION: (userId) => `session:${userId}`,
  USER_PROFILE: (userId) => `user:profile:${userId}`,
  ARTISAN_PROFILE: (artisanId) => `artisan:profile:${artisanId}`,
  CLIENT_PROFILE: (clientId) => `client:profile:${clientId}`,
  JOB_DETAILS: (jobId) => `job:${jobId}`,
  ARTISAN_LOCATION: (artisanId) => `location:current:${artisanId}`,
  JOB_MATCHES: (jobId) => `job:matches:${jobId}`,
  RATINGS: (artisanId) => `ratings:artisan:${artisanId}`,
  FEES: 'billing:fees',
  CATEGORIES: 'admin:categories',
  ZONES: 'zones:all'
};

// Queue Names
const QUEUE_NAMES = {
  EMAIL: 'email_queue',
  SMS: 'sms_queue',
  NOTIFICATION: 'notification_queue',
  PAYMENT: 'payment_queue',
  DISPATCH: 'dispatch_queue',
  REPORT: 'report_queue'
};

// Webhook Events
const WEBHOOK_EVENTS = {
  STRIPE: {
    PAYMENT_INTENT_SUCCEEDED: 'payment_intent.succeeded',
    PAYMENT_INTENT_FAILED: 'payment_intent.payment_failed',
    CHARGE_REFUNDED: 'charge.refunded',
    SUBSCRIPTION_CREATED: 'customer.subscription.created',
    SUBSCRIPTION_UPDATED: 'customer.subscription.updated',
    SUBSCRIPTION_DELETED: 'customer.subscription.deleted'
  },
  PAYSTACK: {
    CHARGE_SUCCESS: 'charge.success',
    TRANSFER_SUCCESS: 'transfer.success',
    TRANSFER_FAILED: 'transfer.failed',
    DISPUTE_CREATED: 'charge.dispute.create',
    DISPUTE_RESOLVED: 'charge.dispute.resolve'
  },
  FLUTTERWAVE: {
    CHARGE_COMPLETED: 'charge.completed',
    TRANSFER_COMPLETED: 'transfer.completed'
  }
};

// Error Codes
const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT: 'RATE_LIMIT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  PAYMENT_ERROR: 'PAYMENT_ERROR',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  INVALID_OPERATION: 'INVALID_OPERATION'
};

// Response Messages
const RESPONSE_MESSAGES = {
  SUCCESS: 'Operation completed successfully',
  CREATED: 'Resource created successfully',
  UPDATED: 'Resource updated successfully',
  DELETED: 'Resource deleted successfully',
  NOT_FOUND: 'Resource not found',
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Access forbidden',
  VALIDATION_ERROR: 'Validation failed',
  INTERNAL_ERROR: 'Internal server error',
  RATE_LIMIT: 'Too many requests'
};

// Date Formats
const DATE_FORMATS = {
  ISO: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
  DATE_ONLY: 'YYYY-MM-DD',
  TIME_ONLY: 'HH:mm:ss',
  DATETIME: 'YYYY-MM-DD HH:mm:ss',
  READABLE: 'MMMM Do YYYY, h:mm:ss a',
  API: 'YYYY-MM-DDTHH:mm:ssZ'
};

// Pagination Defaults
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100
};

// File Upload Limits
const FILE_UPLOAD = {
  MAX_SIZE: 50 * 1024 * 1024, // 50MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'video/mp4'],
  MAX_FILES: 10
};

// Geofence Defaults
const GEOFENCE = {
  DEFAULT_RADIUS: process.env.GOOGLE_MAP_RADIUS, // meters
  ARRIVAL_RADIUS: process.env.GOOGLE_MAP_RADIUS, // meters
  CHECK_INTERVAL: process.env.GEOFENCE_CHECK_INTERVAL_SECONDS, // seconds
};

// Timeouts (in seconds)
const TIMEOUTS = {
  JOB_OFFER_EXPIRY: process.env.JOB_OFFER_EXPIRY_MINUTES, // 2 minutes
  ARRIVAL_PIN_EXPIRY: process.env.JOB_GENERATED_PIN_ARRIVAL_EXPIRES_MINUTES, // 30 minutes
  DISPUTE_BUFFER: process.env.JOB_DISPUTE_BUFFER, // 3 days
  CACHE_DEFAULT: 3600, // 1 hour
  CACHE_USER_SESSION: 86400, // 24 hours
  CACHE_LOCATION: 60 // 1 minute
};

// Pricing Defaults
const PRICING = {
  BASE_FEE: process.env.JOB_BASE_FEE,
  DIAGNOSTICS_RATE_PER_MINUTE: process.env.JOB_DIAGNOSTICS_RATE_PER_MINUTE,
  DIAGNOSTICS_RATE_PER_HOUR: process.env.JOB_DIAGNOSTICS_RATE_PER_HOUR,
  EXECUTION_RATE_PER_MINUTE: process.env.JOB_EXEC_FEE_PER_MINUTE,
  EXECUTION_RATE_PER_HOUR: process.env.JOB_EXEC_FEE_PER_HOUR,
  PLATFORM_COMMISSION_PERCENT: process.env.PLATFORM_COMMISSION_PERCENT,
  MONTHLY_TECHNOLOGY_FEE: process.env.MONTHLY_TECHNOLOGY_FEE,
  ARTISAN_ONBOARDING_FEE: process.env.ARTISAN_ONBOARDING_FEE,
};

// Socket Events
const SOCKET_EVENTS = {
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  JOIN_JOB: 'job:join',
  LEAVE_JOB: 'job:leave',
  UPDATE_LOCATION: 'location:update',
  ARTISAN_LOCATION: 'location:artisan',
  JOB_ACCEPTED: 'job:accepted',
  ARRIVAL_CONFIRMED: 'arrival:confirmed',
  DIAGNOSTICS_PROGRESS: 'diagnostics:progress',
  EXECUTION_UPDATE: 'execution:update',
  CHAT_MESSAGE: 'chat:message',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop'
};

module.exports = {
  USER_TYPES,
  JOB_STATUS,
  SERVICE_TYPES,
  BILLING_MODES,
  BILLING_STATUS,
  ARTISAN_TIERS,
  ARTISAN_TIER_NAMES,
  VERIFICATION_STATUS,
  PAYMENT_STATUS,
  ESCROW_TRANSACTION_TYPES,
  ESCROW_STATUS,
  DISPUTE_STATUS,
  DISPUTE_REASONS,
  NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
  DISPATCH_STATUS,
  BOQ_STATUS,
  CACHE_KEYS,
  QUEUE_NAMES,
  WEBHOOK_EVENTS,
  ERROR_CODES,
  RESPONSE_MESSAGES,
  DATE_FORMATS,
  PAGINATION,
  FILE_UPLOAD,
  GEOFENCE,
  TIMEOUTS,
  PRICING,
  SOCKET_EVENTS
};