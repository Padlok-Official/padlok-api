/**
 * Integration tests for the /auth routes.
 *
 * We mock the DB/Redis layers so the test suite runs without those services,
 * but we still exercise the full Express pipeline: middleware chain,
 * validation, controller, service, error handling, response shape.
 */

jest.mock('@/config/database', () => require('../helpers/mockDeps').dbMock);
jest.mock('@/config/redis', () => require('../helpers/mockDeps').redisMock);

import request from 'supertest';
import { createApp } from '@/app';
import { hashPassword } from '@/utils/password';
import { signAccessToken, signRefreshToken } from '@/utils/jwt';
import { dbMock, clearRedisStore } from '../helpers/mockDeps';

const { pool } = dbMock;

// Silence the audit log model (it swallows its own errors, but make sure
// the mock pool doesn't need to respond).
const setupAuditLogMock = () => {
  // default: INSERT returns nothing, which the audit model tolerates
  return { rows: [] };
};

const makeAdminJoinRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'admin-uuid-1',
  name: 'Super Admin',
  email: 'admin@padlok.com',
  phone_number: null,
  avatar_url: null,
  password_hash: 'set-by-test',
  role_id: 'role-uuid-1',
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
  role_name: 'Super Admin',
  role_description: 'Full access',
  role_is_system: true,
  role_created_by: null,
  role_created_at: new Date('2026-01-01T00:00:00Z'),
  role_updated_at: new Date('2026-01-01T00:00:00Z'),
  permission_keys: ['view_revenue', 'manage_admins', 'resolve_disputes'],
  ...overrides,
});

describe('POST /api/v1/auth/login', () => {
  let app: ReturnType<typeof createApp>;
  const CORRECT_PASSWORD = 'StrongPass123!';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hashPassword(CORRECT_PASSWORD);
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearRedisStore();
  });

  it('returns 200 + tokens + admin DTO on valid credentials', async () => {
    // findByEmailWithPermissions (SELECT admin + role + perms)
    pool.query
      .mockResolvedValueOnce({ rows: [makeAdminJoinRow({ password_hash: passwordHash })] })
      // RefreshTokenModel.create
      .mockResolvedValueOnce({ rows: [{ id: 'refresh-row-1' }] })
      // updateLastLogin
      .mockResolvedValueOnce({ rows: [] })
      // audit log insert
      .mockResolvedValueOnce(setupAuditLogMock());

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@padlok.com', password: CORRECT_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Logged in',
      data: {
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        admin: {
          id: 'admin-uuid-1',
          email: 'admin@padlok.com',
          role: { name: 'Super Admin', isSystem: true },
          permissions: expect.arrayContaining(['manage_admins']),
        },
      },
    });
    // Sensitive fields must NEVER leak
    expect(res.body.data.admin).not.toHaveProperty('passwordHash');
    expect(res.body.data.admin).not.toHaveProperty('password_hash');
    expect(res.body.data.admin).not.toHaveProperty('pinHash');
  });

  it('returns 401 on wrong password with generic message', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [makeAdminJoinRow({ password_hash: passwordHash })] })
      .mockResolvedValueOnce(setupAuditLogMock());

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@padlok.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
    expect(res.body.success).toBe(false);
  });

  it('returns 401 on unknown email with the SAME message (no enumeration)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // no admin found
      .mockResolvedValueOnce(setupAuditLogMock());

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@nowhere.com', password: 'anything' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('returns 403 when admin is suspended', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [makeAdminJoinRow({ password_hash: passwordHash, status: 'suspended' })],
      })
      .mockResolvedValueOnce(setupAuditLogMock());

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@padlok.com', password: CORRECT_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/suspended/i);
  });

  it('returns 400 with validation error when email is malformed', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'any' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/email/i);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@padlok.com' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/password/i);
  });
});

describe('GET /api/v1/auth/me', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearRedisStore();
  });

  it('returns 401 without Authorization header', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 on malformed Bearer token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
  });

  it('returns 401 when a refresh token is used in place of an access token', async () => {
    const refresh = signRefreshToken({ adminId: 'admin-uuid-1', jti: 'jti-xyz' });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refresh}`);
    expect(res.status).toBe(401);
  });

  it('returns 200 + admin DTO on valid access token', async () => {
    // findByIdWithPermissions — cache miss, falls through to DB
    pool.query.mockResolvedValueOnce({ rows: [makeAdminJoinRow()] });

    const token = signAccessToken({
      adminId: 'admin-uuid-1',
      email: 'admin@padlok.com',
      roleId: 'role-uuid-1',
    });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        admin: {
          id: 'admin-uuid-1',
          email: 'admin@padlok.com',
          role: { name: 'Super Admin' },
          permissions: expect.arrayContaining(['manage_admins']),
        },
      },
    });
  });

  it('returns 403 when the admin is suspended (even with valid JWT)', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [makeAdminJoinRow({ status: 'suspended' })],
    });

    const token = signAccessToken({
      adminId: 'admin-uuid-1',
      email: 'admin@padlok.com',
      roleId: 'role-uuid-1',
    });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 when the admin no longer exists', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const token = signAccessToken({
      adminId: 'admin-uuid-1',
      email: 'admin@padlok.com',
      roleId: 'role-uuid-1',
    });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/no longer/i);
  });
});

describe('POST /api/v1/auth/logout', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearRedisStore();
  });

  it('returns 200 and revokes the refresh token', async () => {
    // 1. authenticate loads admin
    pool.query
      .mockResolvedValueOnce({ rows: [makeAdminJoinRow()] })
      // 2. findActiveByRawToken — no matching tokens, skip (refresh token not in DB)
      .mockResolvedValueOnce({ rows: [] })
      // 3. audit log
      .mockResolvedValueOnce(setupAuditLogMock());

    const token = signAccessToken({
      adminId: 'admin-uuid-1',
      email: 'admin@padlok.com',
      roleId: 'role-uuid-1',
    });
    const refresh = signRefreshToken({ adminId: 'admin-uuid-1', jti: 'some-jti' });

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .send({ refreshToken: refresh });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 401 when no access token is provided', async () => {
    const res = await request(app).post('/api/v1/auth/logout').send({});
    expect(res.status).toBe(401);
  });
});
