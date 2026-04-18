import type { Response } from 'express';
import { ok, fail, paginated } from '@/utils/respond';

const mockRes = () => {
  const res = {
    statusCode: 0,
    payload: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(p: unknown) {
      this.payload = p;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; payload: unknown };
};

describe('respond helpers', () => {
  it('ok() returns 200 with success + data + message by default', () => {
    const res = mockRes();
    ok(res, { hello: 'world' });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ success: true, message: 'OK', data: { hello: 'world' } });
  });

  it('ok() accepts custom message and status code', () => {
    const res = mockRes();
    ok(res, { id: 1 }, 'Created', 201);
    expect(res.statusCode).toBe(201);
    expect(res.payload).toMatchObject({ success: true, message: 'Created', data: { id: 1 } });
  });

  it('fail() returns the requested status + shape', () => {
    const res = mockRes();
    fail(res, 404, 'Nope');
    expect(res.statusCode).toBe(404);
    expect(res.payload).toEqual({ success: false, message: 'Nope' });
  });

  it('fail() spreads extra fields into the payload', () => {
    const res = mockRes();
    fail(res, 400, 'Bad', { errors: [{ field: 'email' }] });
    expect(res.payload).toEqual({
      success: false,
      message: 'Bad',
      errors: [{ field: 'email' }],
    });
  });

  it('paginated() computes totalPages correctly', () => {
    const res = mockRes();
    paginated(res, [1, 2, 3], { page: 1, limit: 20, total: 45 });
    expect(res.payload).toEqual({
      success: true,
      data: [1, 2, 3],
      pagination: { page: 1, limit: 20, total: 45, totalPages: 3 },
    });
  });

  it('paginated() returns totalPages=1 when total=0', () => {
    const res = mockRes();
    paginated(res, [], { page: 1, limit: 20, total: 0 });
    expect((res.payload as { pagination: { totalPages: number } }).pagination.totalPages).toBe(1);
  });
});
