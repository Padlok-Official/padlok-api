import {
  AppError,
  BadRequest,
  Unauthorized,
  Forbidden,
  NotFound,
  Conflict,
  UnprocessableEntity,
  TooManyRequests,
} from '@/utils/AppError';

describe('AppError', () => {
  it('carries message + statusCode + isOperational', () => {
    const err = new AppError('boom', 500);
    expect(err.message).toBe('boom');
    expect(err.statusCode).toBe(500);
    expect(err.isOperational).toBe(true);
    expect(err.name).toBe('AppError');
  });

  it('passes optional extra object', () => {
    const err = new AppError('bad', 400, { field: 'email' });
    expect(err.extra).toEqual({ field: 'email' });
  });

  it.each([
    [BadRequest, 400],
    [Unauthorized, 401],
    [Forbidden, 403],
    [NotFound, 404],
    [Conflict, 409],
    [UnprocessableEntity, 422],
    [TooManyRequests, 429],
  ])('%s → status %d', (factory, expectedStatus) => {
    const err = factory('x');
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(expectedStatus);
  });
});
