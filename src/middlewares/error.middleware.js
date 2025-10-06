import { DatabaseError } from "pg";
import logger from "../logger/winston.logger.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { removeUnusedMulterImageFilesOnError } from "../utils/helper.js";

/**
 * @param {Error | ApiError} err
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 *
 * @description This middleware is responsible to catch the errors from any request handler wrapped inside the {@link asyncHandler}
 */
const errorHandler = (err, req, res, next) => {
  let error = err;

  // Check if the error is an instance of an ApiError class which extends native Error class
  if (!(error instanceof ApiError)) {
    // if not, create a new ApiError instance to keep the consistency

    let statusCode = 500;
    let message = error.message || "Something went wrong";

    // Handle PostgreSQL/Neon database errors
    if (error instanceof DatabaseError || error.code) {
      statusCode = 400;

      // Map common PostgreSQL error codes to user-friendly messages
      switch (error.code) {
        case "23505": // unique_violation
          message = "A record with this data already exists";
          break;
        case "23503": // foreign_key_violation
          message = "Referenced record does not exist";
          break;
        case "23502": // not_null_violation
          message = "Required field is missing";
          break;
        case "22P02": // invalid_text_representation
          message = "Invalid data format provided";
          break;
        case "23514": // check_violation
          message = "Data validation failed";
          break;
        case "42P01": // undefined_table
          message = "Database table not found";
          break;
        case "42703": // undefined_column
          message = "Database column not found";
          break;
        case "08006": // connection_failure
        case "08003": // connection_does_not_exist
        case "08000": // connection_exception
          statusCode = 503;
          message = "Database connection error";
          break;
        case "57014": // query_canceled
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

  // Now we are sure that the `error` variable will be an instance of ApiError class
  const response = {
    ...error,
    message: error.message,
    ...(process.env.NODE_ENV === "development" ? { stack: error.stack } : {}), // Error stack traces should be visible in development for debugging
  };

  logger.error(`${error.message}`);
  removeUnusedMulterImageFilesOnError(req);

  // Send error response
  return res.status(error.statusCode).json(response);
};

export { errorHandler };
