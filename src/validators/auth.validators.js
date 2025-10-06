import { body } from "express-validator";

// ==================== REGISTER VALIDATOR ====================
const userRegisterValidator = () => {
  return [
    // 4-digit MPIN
    body("mpin")
      .trim()
      .notEmpty()
      .withMessage("MPIN is required")
      .isLength({ min: 4, max: 4 })
      .withMessage("MPIN must be exactly 4 digits")
      .matches(/^\d{4}$/)
      .withMessage("MPIN must contain only numbers"),

    // First Name (optional but validated if provided)
    body("first_name")
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ min: 2, max: 25 })
      .withMessage("First name must be between 2 and 25 characters")
      .escape(),

    // Last Name (required)
    body("last_name")
      .trim()
      .notEmpty()
      .withMessage("Last name is required")
      .isLength({ min: 2, max: 25 })
      .withMessage("Last name must be between 2 and 25 characters")
      .escape(),

    // Contact (must start with +91)
    body("contact")
      .trim()
      .notEmpty()
      .withMessage("Contact number is required")
      .matches(/^\+91[5-9]\d{9}$/)
      .withMessage("Contact must be in the format +91XXXXXXXXXX")
      .escape(),

    // Date of Birth
    body("date_of_birth")
      .notEmpty()
      .withMessage("Date of Birth is required")
      .isISO8601()
      .withMessage("Invalid date format")
      .custom((value) => {
        if (new Date(value) > new Date()) {
          throw new Error("Date of Birth cannot be in the future");
        }
        return true;
      }),

    // Address fields (all required)
    body("state")
      .trim()
      .notEmpty()
      .withMessage("State is required")
      .isLength({ min: 3 })
      .withMessage("State name is too short"),

    body("district")
      .trim()
      .notEmpty()
      .withMessage("District is required")
      .isLength({ min: 3 })
      .withMessage("District name is too short"),

    body("block")
      .trim()
      .notEmpty()
      .withMessage("Block is required")
      .isLength({ min: 3 })
      .withMessage("Block name is too short"),

    body("village")
      .trim()
      .notEmpty()
      .withMessage("Village is required")
      .isLength({ min: 3 })
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
      .matches(/^\+91[6-9]\d{9}$/)
      .withMessage("Contact must be in the format +91XXXXXXXXXX"),

    body("mpin")
      .trim()
      .notEmpty()
      .withMessage("MPIN is required")
      .isLength({ min: 4, max: 4 })
      .withMessage("MPIN must be exactly 4 digits")
      .matches(/^\d{4}$/)
      .withMessage("MPIN must contain only numbers"),
  ];
};

export { userRegisterValidator, userLoginValidator };
