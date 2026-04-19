import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import * as roleController from './roleController';

const router = Router();

/**
 * GET /api/v1/permissions
 * Lists every permission grouped by category. Used by the Create Role
 * modal on the dashboard. Open to any authenticated admin — it's catalog
 * metadata, not sensitive.
 */
router.get('/', authenticate, roleController.listPermissions);

export default router;
