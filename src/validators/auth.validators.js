import { body } from "express-validator";

// ==================== REGISTER VALIDATOR ====================
const userRegisterValidator = () => {
  return [
    body("mpin")
      .trim()
      .notEmpty()
      .withMessage("MPIN is required")
      .bail()
      .isLength({ min: 4, max: 4 })
      .withMessage("MPIN must be exactly 4 digits")
      .bail()
      .matches(/^\d{4}$/)
      .withMessage("MPIN must contain only numbers"),

    body("first_name")
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ min: 2, max: 25 })
      .withMessage("First name must be between 2 and 25 characters"),

    body("last_name")
      .trim()
      .notEmpty()
      .withMessage("Last name is required")
      .bail()
      .isLength({ min: 2, max: 25 })
      .withMessage("Last name must be between 2 and 25 characters"),

    body("contact")
      .trim()
      .notEmpty()
      .withMessage("Contact number is required")
      .bail()
      .matches(/^\+91[6-9]\d{9}$/)
      .withMessage("Contact must be in the format +91XXXXXXXXXX"),

    body("gender").trim().notEmpty().withMessage("gender is required"),
    body("date_of_birth")
      .notEmpty()
      .withMessage("Date of Birth is required")
      .bail()
      .isISO8601()
      .withMessage("Invalid date format")
      .bail()
      .custom((value) => {
        const dob = new Date(value);
        const now = new Date();

        // Check if date is in the future
        if (dob > now) {
          throw new Error("Date of Birth cannot be in the future");
        }

        // Calculate accurate age
        let age = now.getFullYear() - dob.getFullYear();
        const monthDiff = now.getMonth() - dob.getMonth();
        const dayDiff = now.getDate() - dob.getDate();

        // Adjust age if birthday hasn't occurred this year
        if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
          age--;
        }

        if (age < 10) {
          throw new Error("User must be at least 10 years old");
        }

        return true;
      }),

    body("village_id")
      .trim()
      .notEmpty()
      .withMessage("VillageId is required")
      .bail()
      .isLength({ min: 1 })
      .withMessage("Village name is too short"),
  ];
};

// ==================== LOGIN VALIDATOR ====================
const userLoginValidator = () => {
  return [
    body("contact")
      .trim()
      .notEmpty()
      .withMessage("Contact number is required")
      .bail()
      .matches(/^\+91[6-9]\d{9}$/)
      .withMessage("Contact must be in the format +91XXXXXXXXXX"),

    body("mpin")
      .trim()
      .notEmpty()
      .withMessage("MPIN is required")
      .bail()
      .isLength({ min: 4, max: 4 })
      .withMessage("MPIN must be exactly 4 digits")
      .bail()
      .matches(/^\d{4}$/)
      .withMessage("MPIN must contain only numbers"),
  ];
};

// ==================== CHANGE MPIN VALIDATOR ====================
const userChangeMPINValidator = () => {
  return [
    body("oldMpin")
      .trim()
      .notEmpty()
      .withMessage("Old MPIN is required")
      .bail()
      .isLength({ min: 4, max: 4 })
      .withMessage("Old MPIN must be exactly 4 digits")
      .bail()
      .matches(/^\d{4}$/)
      .withMessage("Old MPIN must contain only numbers"),

    body("newMpin")
      .trim()
      .notEmpty()
      .withMessage("New MPIN is required")
      .bail()
      .isLength({ min: 4, max: 4 })
      .withMessage("New MPIN must be exactly 4 digits")
      .bail()
      .matches(/^\d{4}$/)
      .withMessage("New MPIN must contain only numbers")
      .bail()
      .custom((value, { req }) => {
        if (value === req.body.oldMpin) {
          throw new Error("New MPIN must be different from old MPIN");
        }
        return true;
      }),
  ];
};

// ==================== FORGOT MPIN VALIDATOR ====================
const userForgotMPINValidator = () => {
  return [
    body("contact")
      .trim()
      .notEmpty()
      .withMessage("Contact number is required")
      .bail()
      .matches(/^\+91[6-9]\d{9}$/)
      .withMessage("Contact must be in the format +91XXXXXXXXXX"),
  ];
};

// ==================== RESET MPIN VALIDATOR ====================
const userResetForgottenMPINValidator = () => {
  return [
    body("newMpin")
      .trim()
      .notEmpty()
      .withMessage("New MPIN is required")
      .bail()
      .isLength({ min: 4, max: 4 })
      .withMessage("New MPIN must be exactly 4 digits")
      .bail()
      .matches(/^\d{4}$/)
      .withMessage("New MPIN must contain only numbers"),
  ];
};

export {
  userRegisterValidator,
  userLoginValidator,
  userChangeMPINValidator,
  userForgotMPINValidator,
  userResetForgottenMPINValidator,
};
