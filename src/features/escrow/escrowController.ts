/**
 * escrowController — thin HTTP adapter for admin-scoped escrow ops.
 */

import type { RequestHandler } from 'express';
import { ok, paginated } from '@/utils/respond';
import { parsePagination } from '@/utils/pagination';
import { Unauthorized } from '@/utils/AppError';
import * as escrowService from './escrowService';
import * as flagService from '@/features/flag/flagService';
import * as notificationService from '@/features/notification/notificationService';

export const listEscrows: RequestHandler = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });
    const result = await escrowService.listEscrows({
      page,
      limit,
      status: req.query.status as escrowService.ListEscrowsQuery['status'],
      buyerId: req.query.buyerId as string | undefined,
      sellerId: req.query.sellerId as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    return paginated(res, result.items, { page, limit, total: result.total });
  } catch (err) {
    next(err);
  }
};

export const getEscrow: RequestHandler = async (req, res, next) => {
  try {
    const escrow = await escrowService.getEscrowById(req.params.id);
    return ok(res, escrow);
  } catch (err) {
    next(err);
  }
};

export const getStats: RequestHandler = async (req, res, next) => {
  try {
    const currency = (req.query.currency as string | undefined) ?? 'NGN';
    const stats = await escrowService.getEscrowStats(currency);
    return ok(res, stats);
  } catch (err) {
    next(err);
  }
};

export const disputeStats: RequestHandler = async (_req, res, next) => {
  try {
    return ok(res, await escrowService.getDisputeStats());
  } catch (err) {
    next(err);
  }
};

export const disputeTimeline: RequestHandler = async (req, res, next) => {
  try {
    return ok(res, await escrowService.getDisputeTimeline(req.params.id));
  } catch (err) {
    next(err);
  }
};

export const getDispute: RequestHandler = async (req, res, next) => {
  try {
    const dispute = await escrowService.getDispute(req.params.id);
    if (!dispute) {
      res.status(404).json({ success: false, message: 'Dispute not found' });
      return;
    }
    return ok(res, dispute);
  } catch (err) {
    next(err);
  }
};

export const listDisputes: RequestHandler = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });
    const result = await escrowService.listDisputes({
      page,
      limit,
      status: req.query.status as escrowService.ListDisputesQuery['status'],
    });
    return paginated(res, result.items, { page, limit, total: result.total });
  } catch (err) {
    next(err);
  }
};

export const resolveDispute: RequestHandler = async (req, res, next) => {
  try {
    if (!req.admin) throw Unauthorized('Authentication required');
    const result = await escrowService.resolveDispute({
      disputeId: req.params.id,
      adminId: req.admin.admin.id,
      resolution: req.body.resolution,
      adminNotes: req.body.admin_notes,
    });
    return ok(
      res,
      result,
      `Dispute resolved — funds ${
        result.resolution === 'refund' ? 'refunded to buyer' : 'released to seller'
      }`,
    );
  } catch (err) {
    next(err);
  }
};

export const payoutDispute: RequestHandler = async (req, res, next) => {
  try {
    if (!req.admin) throw Unauthorized('Authentication required');
    const result = await escrowService.resolveDispute({
      disputeId: req.params.id,
      adminId: req.admin.admin.id,
      resolution: 'release',
      adminNotes: req.body.note,
    });
    return ok(res, result, 'Dispute resolved — funds released to seller');
  } catch (err) {
    next(err);
  }
};

export const refundDispute: RequestHandler = async (req, res, next) => {
  try {
    if (!req.admin) throw Unauthorized('Authentication required');
    const result = await escrowService.resolveDispute({
      disputeId: req.params.id,
      adminId: req.admin.admin.id,
      resolution: 'refund',
      adminNotes: req.body.note,
    });
    return ok(res, result, 'Dispute resolved — funds refunded to buyer');
  } catch (err) {
    next(err);
  }
};

export const penalizeUser: RequestHandler = async (req, res, next) => {
  try {
    if (!req.admin) throw Unauthorized('Authentication required');
    const result = await flagService.createFlag({
      userId: req.body.targetUserId,
      flaggedBy: req.admin.admin.id,
      reason: req.body.reason,
      severity: req.body.severity,
      relatedDisputeId: req.params.id,
    });
    return ok(res, result, 'User penalized successfully');
  } catch (err) {
    next(err);
  }
};

export const flagDispute: RequestHandler = async (req, res, next) => {
  try {
    if (!req.admin) throw Unauthorized('Authentication required');
    
    // Using createFlag for dispute flagging, assigning it to the raised_by user
    // In a real scenario, dispute flags might need their own table or just be related.
    // For now, we fetch the dispute to find out who to flag, or just return ok.
    const dispute = await escrowService.getDispute(req.params.id);
    if (!dispute) {
      res.status(404).json({ success: false, message: 'Dispute not found' });
      return;
    }
    
    const result = await flagService.createFlag({
      userId: dispute.raised_by, // applying flag to the user who raised it, or a generic system action
      flaggedBy: req.admin.admin.id,
      reason: req.body.flagType,
      severity: 'warning',
      category: req.body.flagType,
      relatedDisputeId: dispute.id,
      notes: req.body.note,
    });
    return ok(res, result, 'Dispute flagged successfully');
  } catch (err) {
    next(err);
  }
};

export const getMessageTemplates: RequestHandler = async (_req, res, next) => {
  try {
    return ok(res, await escrowService.getMessageTemplates());
  } catch (err) {
    next(err);
  }
};

export const sendMessage: RequestHandler = async (req, res, next) => {
  try {
    if (!req.admin) throw Unauthorized('Authentication required');
    const dispute = await escrowService.getDispute(req.params.id);
    if (!dispute) {
      res.status(404).json({ success: false, message: 'Dispute not found' });
      return;
    }

    const recipientId = req.body.recipient === 'buyer' ? dispute.buyer_id : dispute.seller_id;
    if (!recipientId) {
      res.status(400).json({ success: false, message: `Dispute has no ${req.body.recipient}` });
      return;
    }

    const message = await escrowService.sendDisputeMessage({
      disputeId: dispute.id,
      recipientId,
      adminId: req.admin.admin.id,
      templateId: req.body.templateId,
      body: req.body.body,
      channel: req.body.channel,
    });

    // Also send an actual notification using the notificationService
    await notificationService.sendNotification({
      type: 'dispute_update',
      title: 'New Dispute Message',
      body: req.body.body,
      userId: recipientId,
      channels: {
        push: req.body.channel === 'in-app' || req.body.channel === 'push',
        email: req.body.channel === 'email',
        sms: req.body.channel === 'sms',
      },
      data: { disputeId: dispute.id }
    });

    return ok(res, message, 'Message sent successfully');
  } catch (err) {
    next(err);
  }
};

export const getMessages: RequestHandler = async (req, res, next) => {
  try {
    return ok(res, await escrowService.getDisputeMessages(req.params.id));
  } catch (err) {
    next(err);
  }
};

