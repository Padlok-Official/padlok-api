import type { RequestHandler } from 'express';
import { ok, paginated } from '@/utils/respond';
import { parsePagination } from '@/utils/pagination';
import * as notificationService from './notificationService';

export const list: RequestHandler = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });
    const result = await notificationService.listNotifications({
      page,
      limit,
      type: req.query.type as notificationService.NotificationType | undefined,
      userId: req.query.userId as string | undefined,
      unreadOnly: req.query.unread_only === 'true',
    });
    return paginated(res, result.items, { page, limit, total: result.total });
  } catch (err) {
    next(err);
  }
};

export const stats: RequestHandler = async (_req, res, next) => {
  try {
    return ok(res, await notificationService.getNotificationStats());
  } catch (err) {
    next(err);
  }
};

export const send: RequestHandler = async (req, res, next) => {
  try {
    const result = await notificationService.sendNotification({
      type: req.body.type,
      title: req.body.title,
      body: req.body.body,
      userId: req.body.userId,
      userIds: req.body.userIds,
      broadcast: req.body.broadcast === true,
      channels: req.body.channels,
      data: req.body.data,
    });
    return ok(res, result, `Notification sent to ${result.recipients} recipient(s)`, 201);
  } catch (err) {
    next(err);
  }
};

export const markRead: RequestHandler = async (req, res, next) => {
  try {
    await notificationService.markRead(req.params.id);
    return ok(res, null, 'Marked as read');
  } catch (err) {
    next(err);
  }
};
