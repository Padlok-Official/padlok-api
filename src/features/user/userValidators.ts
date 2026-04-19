import { body, param, query } from 'express-validator';

export const listValidators = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim().isLength({ min: 1, max: 200 }),
  query('status').optional().isIn(['active', 'suspended', 'flagged', 'banned']),
  query('minFlags').optional().isInt({ min: 1 }).toInt(),
];

export const idValidator = [param('id').isUUID().withMessage('Valid user id required')];

export const setStatusValidators = [
  param('id').isUUID(),
  body('status').isIn(['active', 'inactive']).withMessage('status must be active|inactive'),
];
