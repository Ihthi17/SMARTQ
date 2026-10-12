export const apiResponse = (response, statusCode, data) => response.status(statusCode).json(data);
