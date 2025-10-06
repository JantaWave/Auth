import { validationResult } from "express-validator";
import { ApiError } from "../utils/ApiError.js";

/**
 * @description
 * Centralized request validation middleware.
 * Checks for validation errors from express-validator chains,
 * structures them uniformly, and forwards them to the global errorHandler.
 *
 * @usage
 * router.post("/register", userRegisterValidator(), validate, controller);
 *
 * @throws {ApiError} - If validation fails.
 *
 * @example
 * Response structure:
 * {
 *   "success": false,
 *   "statusCode": 422,
 *   "message": "Received data is not valid",
 *   "errors": [
 *     { "field": "contact", "message": "Invalid format" }
 *   ]
 * }
 */
export const validate = (req, res, next) => {
  const errors = validationResult(req);

  // If there are no validation errors → proceed
  if (errors.isEmpty()) {
    return next();
  }

  // Extract all errors into a consistent shape
  const extractedErrors = errors.array().map((err) => ({
    field: err.path,
    message: err.msg,
  }));

  // Forward structured error to errorHandler
  return next(new ApiError(422, "Received data is not valid", extractedErrors));
};
