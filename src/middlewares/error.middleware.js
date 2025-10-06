import { DatabaseError } from "pg";
import logger from "../logger/winston.logger.js";
import { ApiError } from "../utils/ApiError.js";
import { removeUnusedMulterImageFilesOnError } from "../utils/helper.js";

/**
 * Global error-handling middleware.
 * Converts any thrown error into a uniform ApiError format and logs it.
 */
const errorHandler = (err, req, res, next) => {
  let error = err;

  // 🧱 Handle invalid JSON body
  if (error instanceof SyntaxError && "body" in error) {
    error = new ApiError(400, "Invalid JSON format");
  }

  // 🖼 Handle Multer file upload size error
  if (error.code === "LIMIT_FILE_SIZE") {
    error = new ApiError(413, "Uploaded file too large");
  }

  // 🧩 Convert unknown errors into ApiError for consistency
  if (!(error instanceof ApiError)) {
    let statusCode = 500;
    let message = error.message || "Something went wrong";

    // 🗄 Handle PostgreSQL/Neon DB errors
    if (error instanceof DatabaseError || error.code) {
      statusCode = 400;
      switch (error.code) {
        case "23505":
          message = "A record with this data already exists";
          break;
        case "23503":
          message = "Referenced record does not exist";
          break;
        case "23502":
          message = "Required field is missing";
          break;
        case "22P02":
          message = "Invalid data format provided";
          break;
        case "23514":
          message = "Data validation failed";
          break;
        case "42P01":
          message = "Database table not found";
          break;
        case "42703":
          message = "Database column not found";
          break;
        case "08006":
        case "08003":
        case "08000":
          statusCode = 503;
          message = "Database connection error";
          break;
        case "57014":
          statusCode = 408;
          message = "Database query timeout";
          break;
        default:
          message = error.message || "Database operation failed";
      }
    } else if (error.statusCode) {
      statusCode = error.statusCode;
    }

    error = new ApiError(statusCode, message, error?.errors || [], err.stack);
  }

  // 🧾 Standardized error response
  const response = {
    success: false,
    statusCode: error.statusCode,
    message: error.message,
    errors: error.errors || [],
    ...(process.env.NODE_ENV === "development" ? { stack: error.stack } : {}),
  };

  // 🧹 Cleanup temporary uploads if request failed
  removeUnusedMulterImageFilesOnError(req);

  // 🪵 Log the error
  logger.error(`${error.message}\n${error.stack}`);

  // 🚀 Send response
  return res.status(error.statusCode).json(response);
};

export { errorHandler };
