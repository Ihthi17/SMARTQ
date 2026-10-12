export const notFoundHandler = (request, response) => {
  response.status(404).json({ message: `Route not found: ${request.method} ${request.path}` });
};

export const errorHandler = (error, _request, response, _next) => {
  const statusCode = error.statusCode || error.status ||
    (error.name === 'ValidationError' || error.name === 'CastError' ? 400 : null) ||
    (error.code === 11000 ? 409 : 500);
  if (statusCode === 500) console.error('Unhandled server error:', error);
  response.status(statusCode).json({
    message: statusCode === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : error.message,
  });
};
