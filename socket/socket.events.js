/**
 * Socket.IO Event Constants
 * Centralized event names for consistency
 */

// Connection Events
const CONNECTION = 'connection';
const DISCONNECT = 'disconnect';
const CONNECT_ERROR = 'connect_error';
const RECONNECT = 'reconnect';
const RECONNECT_ATTEMPT = 'reconnect_attempt';

// Job Events
const JOB_JOIN = 'job:join';
const JOB_LEAVE = 'job:leave';
const JOB_JOINED = 'job:joined';
const JOB_LEFT = 'job:left';
const JOB_ACCEPT = 'job:accept';
const JOB_ACCEPTED = 'job:accepted';
const JOB_COMPLETE = 'job:complete';
const JOB_COMPLETED = 'job:completed';
const JOB_CANCEL = 'job:cancel';
const JOB_CANCELLED = 'job:cancelled';
const JOB_OFFER = 'job:offer';
const JOB_OFFER_EXPIRED = 'job:offer:expired';

// Location Events
const LOCATION_UPDATE = 'location:update';
const LOCATION_REQUEST = 'location:request';
const LOCATION_ARTISAN = 'location:artisan';
const LOCATION_UNAVAILABLE = 'location:unavailable';

// Artisan Events
const ARTISAN_AVAILABILITY = 'artisan:availability';
const ARTISAN_AVAILABILITY_UPDATED = 'artisan:availability:updated';
const ARTISAN_ONLINE = 'artisan:online';
const ARTISAN_OFFLINE = 'artisan:offline';

// Diagnostics Events
const DIAGNOSTICS_START = 'diagnostics:start';
const DIAGNOSTICS_STARTED = 'diagnostics:started';
const DIAGNOSTICS_PROGRESS = 'diagnostics:progress';
const DIAGNOSTICS_STOP = 'diagnostics:stop';
const DIAGNOSTICS_COMPLETED = 'diagnostics:completed';

// Execution Events
const EXECUTION_START = 'execution:start';
const EXECUTION_STARTED = 'execution:started';
const EXECUTION_PAUSE = 'execution:pause';
const EXECUTION_PAUSED = 'execution:paused';
const EXECUTION_RESUME = 'execution:resume';
const EXECUTION_RESUMED = 'execution:resumed';
const EXECUTION_STOP = 'execution:stop';
const EXECUTION_COMPLETED = 'execution:completed';

// Quote Events
const QUOTE_SUBMIT = 'quote:submit';
const QUOTE_SUBMITTED = 'quote:submitted';
const QUOTE_APPROVE = 'quote:approve';
const QUOTE_APPROVED = 'quote:approved';
const QUOTE_REJECT = 'quote:reject';
const QUOTE_REJECTED = 'quote:rejected';
const QUOTE_RECEIVED = 'quote:received';

// Arrival Events
const ARRIVAL_CONFIRM = 'arrival:confirm';
const ARRIVAL_CONFIRMED = 'arrival:confirmed';

// Chat Events
const CHAT_MESSAGE = 'chat:message';
const CHAT_MESSAGE_SENT = 'chat:message:sent';
const CHAT_MESSAGE_RECEIVED = 'chat:message:received';
const CHAT_READ = 'chat:read';
const CHAT_READ_CONFIRMED = 'chat:read:confirmed';
const CHAT_UNREAD = 'chat:unread';
const CHAT_UNREAD_COUNT = 'chat:unread:count';
const CHAT_HISTORY = 'chat:history';
const CHAT_HISTORY_LOADED = 'chat:history:loaded';

// Typing Events
const TYPING_START = 'typing:start';
const TYPING_STARTED = 'typing:started';
const TYPING_STOP = 'typing:stop';
const TYPING_STOPPED = 'typing:stopped';

// User Events
const USER_ONLINE = 'user:online';
const USER_OFFLINE = 'user:offline';

// Status Events
const STATUS_CHECK = 'status:check';
const STATUS_RESPONSE = 'status:response';
const PING = 'ping';
const PONG = 'pong';

// Error Events
const ERROR = 'error';

module.exports = {
  // Connection
  CONNECTION,
  DISCONNECT,
  CONNECT_ERROR,
  RECONNECT,
  RECONNECT_ATTEMPT,
  
  // Job
  JOB_JOIN,
  JOB_LEAVE,
  JOB_JOINED,
  JOB_LEFT,
  JOB_ACCEPT,
  JOB_ACCEPTED,
  JOB_COMPLETE,
  JOB_COMPLETED,
  JOB_CANCEL,
  JOB_CANCELLED,
  JOB_OFFER,
  JOB_OFFER_EXPIRED,
  
  // Location
  LOCATION_UPDATE,
  LOCATION_REQUEST,
  LOCATION_ARTISAN,
  LOCATION_UNAVAILABLE,
  
  // Artisan
  ARTISAN_AVAILABILITY,
  ARTISAN_AVAILABILITY_UPDATED,
  ARTISAN_ONLINE,
  ARTISAN_OFFLINE,
  
  // Diagnostics
  DIAGNOSTICS_START,
  DIAGNOSTICS_STARTED,
  DIAGNOSTICS_PROGRESS,
  DIAGNOSTICS_STOP,
  DIAGNOSTICS_COMPLETED,
  
  // Execution
  EXECUTION_START,
  EXECUTION_STARTED,
  EXECUTION_PAUSE,
  EXECUTION_PAUSED,
  EXECUTION_RESUME,
  EXECUTION_RESUMED,
  EXECUTION_STOP,
  EXECUTION_COMPLETED,
  
  // Quote
  QUOTE_SUBMIT,
  QUOTE_SUBMITTED,
  QUOTE_APPROVE,
  QUOTE_APPROVED,
  QUOTE_REJECT,
  QUOTE_REJECTED,
  QUOTE_RECEIVED,
  
  // Arrival
  ARRIVAL_CONFIRM,
  ARRIVAL_CONFIRMED,
  
  // Chat
  CHAT_MESSAGE,
  CHAT_MESSAGE_SENT,
  CHAT_MESSAGE_RECEIVED,
  CHAT_READ,
  CHAT_READ_CONFIRMED,
  CHAT_UNREAD,
  CHAT_UNREAD_COUNT,
  CHAT_HISTORY,
  CHAT_HISTORY_LOADED,
  
  // Typing
  TYPING_START,
  TYPING_STARTED,
  TYPING_STOP,
  TYPING_STOPPED,
  
  // User
  USER_ONLINE,
  USER_OFFLINE,
  
  // Status
  STATUS_CHECK,
  STATUS_RESPONSE,
  PING,
  PONG,
  
  // Error
  ERROR
};