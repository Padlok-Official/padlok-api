jest.mock('@/config/database', () => require('../helpers/mockDeps').dbMock);
jest.mock('@/config/redis', () => require('../helpers/mockDeps').redisMock);

import request from 'supertest';
import { createApp } from '@/app';
import { signAccessToken } from '@/utils/jwt';
import { dbMock, clearRedisStore } from '../helpers/mockDeps';

const { pool } = dbMock;

const adminRow = (permissions: string[]) => ({
  id: 'admin-1',
  name: 'Admin',
  email: 'admin@padlok.com',
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
  role_name: 'Super Admin',
  role_description: 'Full',
  role_is_system: true,
  role_created_by: null,
  role_created_at: new Date('2026-01-01T00:00:00Z'),
  role_updated_at: new Date('2026-01-01T00:00:00Z'),
  permission_keys: permissions,
});

const roleRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'role-1',
  name: 'Branch Supervisor',
  description: 'Manages branches',
  is_system: false,
  created_by: null,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  permission_count: 5,
  user_count: 2,
  ...over,
});

const bearer = () =>
  `Bearer ${signAccessToken({ adminId: 'admin-1', email: 'admin@padlok.com', roleId: 'role-1' })}`;

let app: ReturnType<typeof createApp>;
beforeAll(() => { app = createApp(); });
beforeEach(() => {
  // NB: clearAllMocks() does NOT drain queued mockResolvedValueOnce calls.
  // Use mockReset() on each call-queue we populate per-test to avoid
  // cross-test pollution (a left-over mock gets consumed by the next test,
  // returning the wrong admin permissions and flipping 403/400 outcomes).
  pool.query.mockReset();
  pool.connect.mockReset();
  clearRedisStore();
});

describe('GET /api/v1/roles', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/roles');
    expect(res.status).toBe(401);
  });

  it('returns 403 without manage_roles permission', async () => {
    pool.query.mockResolvedValueOnce({ rows: [adminRow(['view_users'])] });
    const res = await request(app).get('/api/v1/roles').set('Authorization', bearer());
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/manage_roles/);
  });

  it('returns the list of roles with permission + user counts', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [adminRow(['manage_roles'])] })
      .mockResolvedValueOnce({
        rows: [
          roleRow({ id: 'r-1', name: 'Super Admin', is_system: true, permission_count: 31, user_count: 2 }),
          roleRow({ id: 'r-2', name: 'Clerk', is_system: false, permission_count: 6, user_count: 5 }),
        ],
      });

    const res = await request(app).get('/api/v1/roles').set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(res.body.data.roles).toHaveLength(2);
    expect(res.body.data.roles[0]).toMatchObject({
      id: 'r-1',
      name: 'Super Admin',
      isSystem: true,
      permissionCount: 31,
      userCount: 2,
    });
  });
});

describe('POST /api/v1/roles', () => {
  it('returns 400 when the name is missing', async () => {
    pool.query.mockResolvedValueOnce({ rows: [adminRow(['manage_roles'])] });
    const res = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', bearer())
      .send({ description: 'x', permissionKeys: ['view_users'] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/name/i);
  });

  it('returns 400 when permissionKeys is empty', async () => {
    pool.query.mockResolvedValueOnce({ rows: [adminRow(['manage_roles'])] });
    const res = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', bearer())
      .send({ name: 'Test', permissionKeys: [] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/permission/i);
  });

  it('returns 409 when a role with the same name exists', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [adminRow(['manage_roles'])] }) // auth
      .mockResolvedValueOnce({ rows: [roleRow({ name: 'Clerk' })] }); // findByName

    const res = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', bearer())
      .send({ name: 'Clerk', permissionKeys: ['view_users'] });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);
  });

  it('returns 400 when a permission key is unknown', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [adminRow(['manage_roles'])] }) // auth
      .mockResolvedValueOnce({ rows: [] }) // findByName (no clash)
      .mockResolvedValueOnce({ rows: [{ id: 'p-1', key: 'view_users' }] }); // findIdsByKeys — missing 'bogus_key'

    const res = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', bearer())
      .send({ name: 'New', permissionKeys: ['view_users', 'bogus_key'] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/unknown permission/i);
    expect(res.body.unknownKeys).toContain('bogus_key');
  });

  it('creates a role and returns 201 + detail with permissions', async () => {
    // Transactional flow uses pool.connect() — provide a mock client
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'new-role-id' }] }) // INSERT admin_roles
        .mockResolvedValueOnce(undefined) // DELETE role_permissions
        .mockResolvedValueOnce(undefined) // INSERT role_permissions
        .mockResolvedValueOnce(undefined), // COMMIT
      release: jest.fn(),
    };
    pool.connect.mockResolvedValueOnce(mockClient);

    pool.query
      .mockResolvedValueOnce({ rows: [adminRow(['manage_roles'])] }) // auth
      .mockResolvedValueOnce({ rows: [] }) // findByName
      .mockResolvedValueOnce({ rows: [{ id: 'p-1', key: 'view_users' }] }) // ensureKeysExist
      .mockResolvedValueOnce({ rows: [] }) // audit log insert
      // getById follow-up
      .mockResolvedValueOnce({ rows: [{
        id: 'new-role-id',
        name: 'New Role',
        description: null,
        is_system: false,
        created_by: 'admin-1',
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
      }] })
      .mockResolvedValueOnce({ rows: [{ id: 'p-1', key: 'view_users', label: 'View Users', category: 'User', description: null }] });

    const res = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', bearer())
      .send({ name: 'New Role', permissionKeys: ['view_users'] });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toMatchObject({
      id: 'new-role-id',
      name: 'New Role',
      isSystem: false,
      permissions: [{ key: 'view_users', label: 'View Users' }],
    });
  });
});

describe('DELETE /api/v1/roles/:id', () => {
  // Valid v4 UUID (version nibble = 4, variant = 8/9/a/b)
  const VALID_UUID = '11111111-1111-4111-8111-111111111111';

  it('returns 403 on system roles', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [adminRow(['manage_roles'])] })
      .mockResolvedValueOnce({ rows: [roleRow({ id: VALID_UUID, is_system: true })] });

    const res = await request(app)
      .delete(`/api/v1/roles/${VALID_UUID}`)
      .set('Authorization', bearer());

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/system role/i);
  });

  it('returns 409 when admins still hold the role', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [adminRow(['manage_roles'])] })
      .mockResolvedValueOnce({ rows: [roleRow({ id: VALID_UUID, is_system: false })] })
      .mockResolvedValueOnce({ rows: [{ count: '3' }] }); // countUsersWithRole

    const res = await request(app)
      .delete(`/api/v1/roles/${VALID_UUID}`)
      .set('Authorization', bearer());

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/still assigned/i);
    expect(res.body.userCount).toBe(3);
  });

  it('deletes when no admins hold the role', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [adminRow(['manage_roles'])] })
      .mockResolvedValueOnce({ rows: [roleRow({ id: VALID_UUID, is_system: false })] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] }) // DELETE
      .mockResolvedValueOnce({ rows: [] }); // audit

    const res = await request(app)
      .delete(`/api/v1/roles/${VALID_UUID}`)
      .set('Authorization', bearer());

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });

  it('returns 400 on a malformed id', async () => {
    pool.query.mockResolvedValueOnce({ rows: [adminRow(['manage_roles'])] });
    const res = await request(app)
      .delete('/api/v1/roles/not-a-uuid')
      .set('Authorization', bearer());
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/permissions', () => {
  it('returns permissions grouped by category', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [adminRow([])] }) // auth — any admin can read
      .mockResolvedValueOnce({
        rows: [
          { id: 'p1', key: 'view_revenue', label: 'View Revenue', category: 'Financial', description: null },
          { id: 'p2', key: 'export_financials', label: 'Export Financials', category: 'Financial', description: null },
          { id: 'p3', key: 'view_users', label: 'View Users', category: 'User Management', description: null },
        ],
      });

    const res = await request(app).get('/api/v1/permissions').set('Authorization', bearer());

    expect(res.status).toBe(200);
    expect(res.body.data.categories).toEqual([
      {
        category: 'Financial',
        permissions: [
          { key: 'view_revenue', label: 'View Revenue', description: null },
          { key: 'export_financials', label: 'Export Financials', description: null },
        ],
      },
      {
        category: 'User Management',
        permissions: [
          { key: 'view_users', label: 'View Users', description: null },
        ],
      },
    ]);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/permissions');
    expect(res.status).toBe(401);
  });
});
