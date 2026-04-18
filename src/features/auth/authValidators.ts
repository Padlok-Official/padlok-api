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

export const acceptInviteValidators = [
  body('token')
    .isString()
    .isLength({ min: 32, max: 128 })
    .withMessage('A valid invitation token is required'),
  body('name')
    .isString()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Name must be 2–200 characters'),
  body('password')
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be at least 8 characters'),
];
