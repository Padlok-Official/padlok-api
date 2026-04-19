jest.mock('@/config/database', () => require('../helpers/mockDeps').dbMock);
jest.mock('@/config/redis', () => require('../helpers/mockDeps').redisMock);

import request from 'supertest';
import { createApp } from '@/app';
import { signAccessToken } from '@/utils/jwt';
import { dbMock, clearRedisStore } from '../helpers/mockDeps';

const { pool } = dbMock;

const adminRow = (permissions: string[]) => ({
  id: 'admin-1',
  name: 'Tester',
  email: 'test@padlok.com',
  phone_number: null,
  avatar_url: null,
  password_hash: 'x',
  role_id: 'role-1',
  status: 'active',
  invited_by: null,
  last_active_at: null,
  last_login_at: null,
  last_login_ip: null,
  pin_hash: null,
  pin_set_at: null,
  pin_attempts: 0,
  pin_locked_until: null,
  password_reset_token: null,
  password_reset_expires_at: null,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  deleted_at: null,
  role_name: 'Test Role',
  role_description: null,
  role_is_system: false,
  role_created_by: null,
  role_created_at: new Date('2026-01-01T00:00:00Z'),
  role_updated_at: new Date('2026-01-01T00:00:00Z'),
  permission_keys: permissions,
});

const bearerFor = (adminId = 'admin-1') =>
  `Bearer ${signAccessToken({ adminId, email: 'test@padlok.com', roleId: 'role-1' })}`;

describe('GET /api/v1/analytics/platform-activity', () => {
  let app: ReturnType<typeof createApp>;
  beforeAll(() => { app = createApp(); });
  beforeEach(() => {
    // mockReset (not clearAllMocks) drains queued mockResolvedValueOnce.
    pool.query.mockReset();
    pool.connect.mockReset();
    clearRedisStore();
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/analytics/platform-activity');
    expect(res.status).toBe(401);
  });

  it('returns 403 when admin lacks view_analytics permission', async () => {
    pool.query.mockResolvedValueOnce({ rows: [adminRow(['view_users'])] });
    const res = await request(app)
      .get('/api/v1/analytics/platform-activity')
      .set('Authorization', bearerFor());
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/view_analytics/);
  });

  it('returns 200 with live counts when authorized', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [adminRow(['view_analytics'])] }) // authenticate
      .mockResolvedValueOnce({ rows: [{ count: '15' }] }) // disputes
      .mockResolvedValueOnce({ rows: [{ count: '10070' }] }) // completed
      .mockResolvedValueOnce({ rows: [{ count: '200' }] }) // ongoing
      .mockResolvedValueOnce({ rows: [{ count: '28450' }] }); // active users

    const res = await request(app)
      .get('/api/v1/analytics/platform-activity')
      .set('Authorization', bearerFor());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        disputes: 15,
        completedTransactions: 10070,
        ongoingTransactions: 200,
        activeUsers: 28450,
        generatedAt: expect.any(String),
      },
    });
  });

  it('falls back to 0 when counts fail without leaking 500', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [adminRow(['view_analytics'])] })
      .mockRejectedValueOnce(
        Object.assign(new Error('relation "disputes" does not exist'), { code: '42P01' }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error('relation "transactions" does not exist'), { code: '42P01' }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error('relation "transactions" does not exist'), { code: '42P01' }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error('relation "users" does not exist'), { code: '42P01' }),
      );

    const res = await request(app)
      .get('/api/v1/analytics/platform-activity')
      .set('Authorization', bearerFor());

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      disputes: 0,
      completedTransactions: 0,
      ongoingTransactions: 0,
      activeUsers: 0,
    });
  });
});
