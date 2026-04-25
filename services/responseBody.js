const successResponse = (status, message, timestamp, data = {}, pagination = null) => {
  const response = {
    success: status,
    message,
    data,
    timestamp,
  };
  if (pagination) { response.pagination = pagination; }

  return response;
};

const errorResponse = (status, errorType, timestamp, message) => ({
  success: status,
  error: errorType,
  message,
  timestamp,
});

module.exports = { successResponse, errorResponse };
