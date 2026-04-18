jest.mock('@/config/database', () => require('../helpers/mockDeps').dbMock);
jest.mock('@/config/redis', () => require('../helpers/mockDeps').redisMock);

import request from 'supertest';
import { createApp } from '@/app';
import { signAccessToken } from '@/utils/jwt';
import { dbMock, clearRedisStore } from '../helpers/mockDeps';

const { pool } = dbMock;

const CURRENT_ADMIN_UUID = '00000000-0000-4000-8000-000000000001';
const OTHER_ADMIN_UUID = '00000000-0000-4000-8000-000000000002';
const ROLE_UUID = '00000000-0000-4000-8000-000000000010';
const SYSTEM_ROLE_UUID = '00000000-0000-4000-8000-000000000011';
const INVITATION_UUID = '00000000-0000-4000-8000-000000000020';

const adminJoinRow = (permissions: string[], over: Record<string, unknown> = {}) => ({
  id: CURRENT_ADMIN_UUID,
  name: 'Kwame Asante',
  email: 'kwame@padlok.com',
  phone_number: null,
  avatar_url: null,
  password_hash: 'x',
  role_id: SYSTEM_ROLE_UUID,
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
  permission_keys: permissions,
  ...over,
});

const bearer = () =>
  `Bearer ${signAccessToken({
    adminId: CURRENT_ADMIN_UUID,
    email: 'kwame@padlok.com',
    roleId: SYSTEM_ROLE_UUID,
  })}`;

let app: ReturnType<typeof createApp>;
beforeAll(() => { app = createApp(); });
beforeEach(() => {
  pool.query.mockReset();
  pool.connect.mockReset();
  clearRedisStore();
});

// --------------------------------------------------------------------------
// POST /admins/invite
// --------------------------------------------------------------------------

describe('POST /api/v1/admins/invite', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/admins/invite').send({});
    expect(res.status).toBe(401);
  });

  it('returns 403 without manage_admins permission', async () => {
    pool.query.mockResolvedValueOnce({ rows: [adminJoinRow(['view_users'])] });
    const res = await request(app)
      .post('/api/v1/admins/invite')
      .set('Authorization', bearer())
      .send({ email: 'new@padlok.com', roleId: ROLE_UUID });
    expect(res.status).toBe(403);
  });

  it('returns 400 when email is malformed', async () => {
    pool.query.mockResolvedValueOnce({ rows: [adminJoinRow(['manage_admins'])] });
    const res = await request(app)
      .post('/api/v1/admins/invite')
      .set('Authorization', bearer())
      .send({ email: 'nope', roleId: ROLE_UUID });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);
  });

  it('returns 400 when roleId is not a UUID', async () => {
    pool.query.mockResolvedValueOnce({ rows: [adminJoinRow(['manage_admins'])] });
    const res = await request(app)
      .post('/api/v1/admins/invite')
      .set('Authorization', bearer())
      .send({ email: 'new@padlok.com', roleId: 'bogus' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when role does not exist', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [adminJoinRow(['manage_admins'])] }) // auth
      .mockResolvedValueOnce({ rows: [] }); // findById role → null

    const res = await request(app)
      .post('/api/v1/admins/invite')
      .set('Authorization', bearer())
      .send({ email: 'new@padlok.com', roleId: ROLE_UUID });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/role/i);
  });

  it('returns 409 when an admin with that email already exists', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [adminJoinRow(['manage_admins'])] })
      .mockResolvedValueOnce({ rows: [{ id: ROLE_UUID, name: 'Clerk', is_system: false }] }) // findById role
      .mockResolvedValueOnce({ rows: [{ id: OTHER_ADMIN_UUID }] }); // existing admin by email

    const res = await request(app)
      .post('/api/v1/admins/invite')
      .set('Authorization', bearer())
      .send({ email: 'existing@padlok.com', roleId: ROLE_UUID });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);
  });

  it('returns 409 when a pending invitation already exists', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [adminJoinRow(['manage_admins'])] })
      .mockResolvedValueOnce({ rows: [{ id: ROLE_UUID, name: 'Clerk', is_system: false }] })
      .mockResolvedValueOnce({ rows: [] }) // no existing admin
      .mockResolvedValueOnce({ rows: [{ id: INVITATION_UUID, status: 'pending' }] }); // pending invite

    const res = await request(app)
      .post('/api/v1/admins/invite')
      .set('Authorization', bearer())
      .send({ email: 'pending@padlok.com', roleId: ROLE_UUID });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/pending invitation/i);
  });

  it('creates an invitation and returns 201 + dev token', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [adminJoinRow(['manage_admins'])] }) // auth
      .mockResolvedValueOnce({ rows: [{ id: ROLE_UUID, name: 'Clerk', description: null, is_system: false, created_by: null, created_at: new Date(), updated_at: new Date() }] }) // findById role
      .mockResolvedValueOnce({ rows: [] }) // no existing admin
      .mockResolvedValueOnce({ rows: [] }) // no pending invite
      .mockResolvedValueOnce({ rows: [{ id: INVITATION_UUID }] }) // create invitation
      .mockResolvedValueOnce({ rows: [] }); // audit log

    const res = await request(app)
      .post('/api/v1/admins/invite')
      .set('Authorization', bearer())
      .send({ email: 'new@padlok.com', roleId: ROLE_UUID });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      invitationId: INVITATION_UUID,
      email: 'new@padlok.com',
      roleName: 'Clerk',
    });
    expect(res.body.data.emailResult.devToken).toEqual(expect.any(String));
    expect(res.body.data.emailResult.inviteUrl).toMatch(/accept-invite\?token=/);
  });
});

// --------------------------------------------------------------------------
// GET /admins
// --------------------------------------------------------------------------

describe('GET /api/v1/admins', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/admins');
    expect(res.status).toBe(401);
  });

  it('returns 403 without manage_admins permission', async () => {
    pool.query.mockResolvedValueOnce({ rows: [adminJoinRow(['view_users'])] });
    const res = await request(app).get('/api/v1/admins').set('Authorization', bearer());
    expect(res.status).toBe(403);
  });

  it('returns paginated admin list', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [adminJoinRow(['manage_admins'])] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: OTHER_ADMIN_UUID,
            name: 'Ama Adjei',
            email: 'ama@padlok.com',
            avatar_url: null,
            status: 'active',
            last_active_at: null,
            last_login_at: null,
            created_at: new Date('2026-01-02'),
            role_id: ROLE_UUID,
            role_name: 'Clerk',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ count: '14' }] });

    const res = await request(app)
      .get('/api/v1/admins?page=1&limit=10')
      .set('Authorization', bearer());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: OTHER_ADMIN_UUID,
      name: 'Ama Adjei',
      role: { id: ROLE_UUID, name: 'Clerk' },
    });
    expect(res.body.pagination).toEqual({ page: 1, limit: 10, total: 14, totalPages: 2 });
  });
});

// --------------------------------------------------------------------------
// DELETE /admins/:id — safety rules
// --------------------------------------------------------------------------

describe('DELETE /api/v1/admins/:id', () => {
  it('blocks self-deletion with 403', async () => {
    pool.query.mockResolvedValueOnce({ rows: [adminJoinRow(['manage_admins'])] });

    const res = await request(app)
      .delete(`/api/v1/admins/${CURRENT_ADMIN_UUID}`)
      .set('Authorization', bearer());

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/your own account/i);
  });

  it('blocks deleting the last Super Admin', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [adminJoinRow(['manage_admins'])] }) // auth
      .mockResolvedValueOnce({ rows: [adminJoinRow(['manage_admins'], { id: OTHER_ADMIN_UUID })] }) // target (also Super Admin, is_system=true)
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // only 1 Super Admin total

    const res = await request(app)
      .delete(`/api/v1/admins/${OTHER_ADMIN_UUID}`)
      .set('Authorization', bearer());

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/last super admin/i);
  });

  it('soft-deletes a non-super admin successfully', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [adminJoinRow(['manage_admins'])] }) // auth
      .mockResolvedValueOnce({
        rows: [
          adminJoinRow(['view_users'], {
            id: OTHER_ADMIN_UUID,
            role_id: ROLE_UUID,
            role_name: 'Clerk',
            role_is_system: false,
          }),
        ],
      }) // target
      .mockResolvedValueOnce({ rows: [] }) // UPDATE soft-delete
      .mockResolvedValueOnce({ rows: [] }); // audit log

    const res = await request(app)
      .delete(`/api/v1/admins/${OTHER_ADMIN_UUID}`)
      .set('Authorization', bearer());

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });
});

// --------------------------------------------------------------------------
// POST /auth/accept-invite
// --------------------------------------------------------------------------

describe('POST /api/v1/auth/accept-invite', () => {
  it('returns 400 when the token is too short', async () => {
    const res = await request(app)
      .post('/api/v1/auth/accept-invite')
      .send({ token: 'short', name: 'Ama', password: 'Strong123!' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/token/i);
  });

  it('returns 400 when the password is too short', async () => {
    const longToken = 'a'.repeat(64);
    const res = await request(app)
      .post('/api/v1/auth/accept-invite')
      .send({ token: longToken, name: 'Ama', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/password/i);
  });

  it('returns 400 on an unknown token', async () => {
    const longToken = 'a'.repeat(64);
    pool.query.mockResolvedValueOnce({ rows: [] }); // findByRawToken returns null

    const res = await request(app)
      .post('/api/v1/auth/accept-invite')
      .send({ token: longToken, name: 'Ama', password: 'Strong123!' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or expired/i);
  });

  it('returns 400 on an expired token', async () => {
    const longToken = 'a'.repeat(64);
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: INVITATION_UUID,
          email: 'new@padlok.com',
          role_id: ROLE_UUID,
          token_hash: 'hash',
          status: 'pending',
          invited_by: CURRENT_ADMIN_UUID,
          expires_at: new Date('2020-01-01T00:00:00Z'), // in the past
          accepted_at: null,
          accepted_as: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });

    const res = await request(app)
      .post('/api/v1/auth/accept-invite')
      .send({ token: longToken, name: 'Ama', password: 'Strong123!' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired/i);
  });

  it('returns 400 when the invitation was already accepted', async () => {
    const longToken = 'a'.repeat(64);
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: INVITATION_UUID,
          email: 'new@padlok.com',
          role_id: ROLE_UUID,
          token_hash: 'hash',
          status: 'accepted',
          invited_by: CURRENT_ADMIN_UUID,
          expires_at: new Date('2030-01-01T00:00:00Z'),
          accepted_at: new Date(),
          accepted_as: OTHER_ADMIN_UUID,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });

    const res = await request(app)
      .post('/api/v1/auth/accept-invite')
      .send({ token: longToken, name: 'Ama', password: 'Strong123!' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already accepted/i);
  });
});

// --------------------------------------------------------------------------
// GET /auth/invitations/:token  (preview for the accept-invite page)
// --------------------------------------------------------------------------

describe('GET /api/v1/auth/invitations/:token', () => {
  const VALID_TOKEN = 'a'.repeat(64);

  const invitationJoinRow = (over: Record<string, unknown> = {}) => ({
    // InvitationRow columns
    id: INVITATION_UUID,
    email: 'new@padlok.com',
    role_id: ROLE_UUID,
    token_hash: 'hash-value',
    status: 'pending' as const,
    invited_by: CURRENT_ADMIN_UUID,
    expires_at: new Date(Date.now() + 5 * 86_400_000), // 5 days from now
    accepted_at: null,
    accepted_as: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    // joined columns
    role_name: 'Branch Supervisor',
    role_description: 'Manages all branches',
    inviter_id: CURRENT_ADMIN_UUID,
    inviter_name: 'Kwame Asante',
    inviter_email: 'kwame@padlok.com',
    ...over,
  });

  it('returns 400 on a token shorter than 32 chars', async () => {
    const res = await request(app).get('/api/v1/auth/invitations/short');
    expect(res.status).toBe(400);
  });

  it('returns 400 + reason=not_found for a garbage token', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // findByRawTokenWithContext → no row
    const res = await request(app).get(`/api/v1/auth/invitations/${VALID_TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('not_found');
  });

  it('returns 200 + preview DTO on a pending, unexpired invitation', async () => {
    pool.query.mockResolvedValueOnce({ rows: [invitationJoinRow()] });

    const res = await request(app).get(`/api/v1/auth/invitations/${VALID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        email: 'new@padlok.com',
        roleName: 'Branch Supervisor',
        roleDescription: 'Manages all branches',
        inviterName: 'Kwame Asante',
        expiresAt: expect.any(String),
      },
    });
    // No token_hash, no admin id, no PII leakage beyond what's needed
    expect(res.body.data).not.toHaveProperty('tokenHash');
    expect(res.body.data).not.toHaveProperty('token_hash');
  });

  it('returns 400 + reason=accepted when the invitation is already accepted', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [invitationJoinRow({ status: 'accepted', accepted_at: new Date(), accepted_as: OTHER_ADMIN_UUID })],
    });
    const res = await request(app).get(`/api/v1/auth/invitations/${VALID_TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('accepted');
  });

  it('returns 400 + reason=revoked when the invitation was revoked', async () => {
    pool.query.mockResolvedValueOnce({ rows: [invitationJoinRow({ status: 'revoked' })] });
    const res = await request(app).get(`/api/v1/auth/invitations/${VALID_TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('revoked');
  });

  it('returns 400 + reason=expired when past the expiry timestamp', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [invitationJoinRow({ expires_at: new Date('2020-01-01T00:00:00Z') })],
    });
    const res = await request(app).get(`/api/v1/auth/invitations/${VALID_TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('expired');
  });

  it('falls back to "A PadLok admin" when the inviter has been deleted', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        invitationJoinRow({
          inviter_id: null,
          inviter_name: null,
          inviter_email: null,
        }),
      ],
    });
    const res = await request(app).get(`/api/v1/auth/invitations/${VALID_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.data.inviterName).toBe('A PadLok admin');
  });
});
