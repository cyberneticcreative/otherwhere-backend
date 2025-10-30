/**
 * Global error handling middleware
 * Must be used as the last middleware in the Express app
 */

function errorHandler(err, req, res, next) {
  // Log the error
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Determine error status code
  const statusCode = err.statusCode || err.status || 500;

  // Prepare error response
  const errorResponse = {
    error: {
      message: err.message || 'An unexpected error occurred',
      status: statusCode
    }
  };

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
    errorResponse.error.details = err.details || null;
  }

  // Handle specific error types
  if (err.name === 'ValidationError') {
    errorResponse.error.message = 'Validation failed';
    errorResponse.error.details = err.details || err.message;
    return res.status(400).json(errorResponse);
  }

  if (err.name === 'UnauthorizedError') {
    errorResponse.error.message = 'Unauthorized access';
    return res.status(401).json(errorResponse);
  }

  if (err.name === 'NotFoundError') {
    errorResponse.error.message = 'Resource not found';
    return res.status(404).json(errorResponse);
  }

  // Handle Twilio errors
  if (err.code && err.code.toString().startsWith('2')) {
    errorResponse.error.message = 'Twilio service error';
    errorResponse.error.twilioCode = err.code;
    return res.status(503).json(errorResponse);
  }

  // Handle OpenAI errors
  if (err.message && err.message.includes('OpenAI')) {
    errorResponse.error.message = 'AI service temporarily unavailable';
    return res.status(503).json(errorResponse);
  }

  // Default error response
  res.status(statusCode).json(errorResponse);
}

/**
 * Not found handler - use before error handler
 */
function notFoundHandler(req, res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.path}`);
  error.status = 404;
  error.name = 'NotFoundError';
  next(error);
}

/**
 * Async error wrapper - wraps async route handlers
 * Usage: app.get('/route', asyncHandler(async (req, res) => { ... }))
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = errorHandler;
module.exports.notFoundHandler = notFoundHandler;
module.exports.asyncHandler = asyncHandler;
