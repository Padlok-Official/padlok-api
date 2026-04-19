import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { requireAnyPermission } from '@/middleware/requirePermission';
import * as analyticsController from './analyticsController';

const router = Router();

router.use(authenticate);

const viewAnalytics = requireAnyPermission(['view_analytics', 'view_revenue']);

// BI Overview — live counts. Polled every 5s by the dashboard.
router.get('/platform-activity', viewAnalytics, analyticsController.platformActivity);

// Dashboard donut chart (total revenue, in escrow, fees).
router.get('/financial-summary', viewAnalytics, analyticsController.financialSummary);

// Revenue line chart for integration-insights + revenue-analytics pages.
router.get('/revenue-trend', viewAnalytics, analyticsController.revenueTrend);

// Seasonal demand area chart (financial-forecast page).
router.get('/seasonal-demand', viewAnalytics, analyticsController.seasonalDemand);

// Forecast stat cards (financial-forecast page).
router.get(
  '/financial-forecast',
  requireAnyPermission(['view_forecasts', 'view_analytics']),
  analyticsController.financialForecast,
);

// Transaction insights card block (integration-insights page).
router.get('/transaction-insights', viewAnalytics, analyticsController.transactionInsights);

// Payment behavior + tiers (payment-behavior page).
router.get('/payment-behavior', viewAnalytics, analyticsController.paymentBehavior);

// Wallet balance trend line (payment-behavior page).
router.get('/wallet-balance-trend', viewAnalytics, analyticsController.walletBalanceTrend);

// Revenue per transaction / availability / pricing efficiency (revenue-analytics).
router.get('/revenue-efficiency', viewAnalytics, analyticsController.revenueEfficiency);

export default router;
