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
