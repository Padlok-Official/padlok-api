import type { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { fail } from '@/utils/respond';

/**
 * Run after express-validator chains to short-circuit on validation errors.
 *   router.post('/login', loginValidators, handleValidation, loginController);
 */
export const handleValidation = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const firstError = errors.array()[0];
  const message = firstError?.msg ?? 'Validation failed';
  fail(res, 400, message, { errors: errors.array() });
};
