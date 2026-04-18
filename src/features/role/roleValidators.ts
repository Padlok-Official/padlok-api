import { body, param } from 'express-validator';

export const createRoleValidators = [
  body('name')
    .isString().withMessage('Name is required')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be 2–100 characters'),
  body('description')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 500 })
    .withMessage('Description must be 500 characters or fewer'),
  body('permissionKeys')
    .isArray({ min: 1 })
    .withMessage('At least one permission is required'),
  body('permissionKeys.*')
    .isString()
    .withMessage('Permission keys must be strings'),
];

export const updateRoleValidators = [
  param('id').isUUID().withMessage('Invalid role id'),
  body('name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be 2–100 characters'),
  body('description')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 500 }),
  body('permissionKeys')
    .optional()
    .isArray({ min: 1 })
    .withMessage('At least one permission is required'),
  body('permissionKeys.*')
    .optional()
    .isString(),
];

export const idParamValidators = [
  param('id').isUUID().withMessage('Invalid role id'),
];
