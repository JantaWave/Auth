// helpers/helper.js
import fs from "fs";
import logger from "../logger/winston.logger.js";

/**
 * Filter an array of objects to include only specified keys.
 * @param {string[]} fieldsArray - List of keys to keep
 * @param {object[]} objectArray - Array of objects to filter
 * @returns {object[]} Filtered array of objects
 */
export const filterObjectKeys = (fieldsArray, objectArray) => {
  if (!Array.isArray(objectArray)) return [];

  return structuredClone(objectArray).map((originalObj) => {
    const obj = {};
    structuredClone(fieldsArray).forEach((field) => {
      if (field?.trim() in originalObj) {
        obj[field] = originalObj[field];
      }
    });
    return Object.keys(obj).length > 0 ? obj : originalObj;
  });
};

/**
 * Build a public URL for a static file.
 * @param {import("express").Request} req - Express request
 * @param {string} fileName - File name stored in /public/images
 * @returns {string} Publicly accessible URL
 */
export const getStaticFilePath = (req, fileName) => {
  return `${req.protocol}://${req.get("host")}/images/${fileName}`;
};

/**
 * Get the local filesystem path of an uploaded file.
 * @param {string} fileName - File name inside /public/images
 * @returns {string} Local path
 */
export const getLocalPath = (fileName) => {
  return `public/images/${fileName}`;
};

/**
 * Delete a local file from the filesystem.
 * @param {string} localPath - Path returned by getLocalPath or multer
 */
export const removeLocalFile = (localPath) => {
  fs.unlink(localPath, (err) => {
    if (err) {
      logger.error(`Error removing file ${localPath}: `, err);
    } else {
      logger.info(`Removed local file: ${localPath}`);
    }
  });
};

/**
 * Remove uploaded files if an error occurs during request processing.
 * Useful for cleaning up after Multer.
 * @param {import("express").Request} req - Express request
 */
export const removeUnusedMulterImageFilesOnError = (req) => {
  try {
    const multerFile = req.file;
    const multerFiles = req.files;

    if (multerFile) {
      removeLocalFile(multerFile.path);
    }

    if (multerFiles) {
      const filesValueArray = Object.values(multerFiles);
      filesValueArray.forEach((fileFields) => {
        fileFields.forEach((fileObject) => {
          removeLocalFile(fileObject.path);
        });
      });
    }
  } catch (error) {
    // Fail silently
    logger.error("Error while removing uploaded image files: ", error);
  }
};
