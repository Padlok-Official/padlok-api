import { body } from 'express-validator';

export const loginValidators = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail({ gmail_remove_dots: false }),
  body('password')
    .isString()
    .withMessage('Password is required')
    .isLength({ min: 1 })
    .withMessage('Password is required'),
];

export const refreshValidators = [
  body('refreshToken')
    .isString()
    .withMessage('Refresh token is required')
    .isLength({ min: 10 })
    .withMessage('Refresh token is required'),
];

export const logoutValidators = [
  body('refreshToken')
    .optional()
    .isString()
    .withMessage('Refresh token must be a string'),
];

// Strong-password regex: ≥1 upper, ≥1 lower, ≥1 digit, ≥1 symbol, ≥10 chars.
const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{10,}$/;

export const createAccountValidators = [
  body('name')
    .isString()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Name must be 2–200 characters'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail({ gmail_remove_dots: false }),
  body('password')
    .isString()
    .matches(STRONG_PASSWORD)
    .withMessage(
      'Password must be ≥10 chars and include upper, lower, number, and symbol',
    ),
  body('roleId')
    .isUUID()
    .withMessage('roleId must be a valid UUID'),
  body('phoneNumber')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ min: 5, max: 30 })
    .withMessage('Phone number must be 5–30 characters'),
];
