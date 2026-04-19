import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { requirePermission } from '@/middleware/requirePermission';
import * as analyticsController from './analyticsController';

const router = Router();

// All analytics routes require an authenticated admin with view_analytics
router.use(authenticate, requirePermission('view_analytics'));

/**
 * GET /api/v1/analytics/platform-activity
 * Returns the live counts rendered by the BI Overview histogram.
 * Frontend polls this every 5 seconds.
 */
router.get('/platform-activity', analyticsController.platformActivity);

export default router;
