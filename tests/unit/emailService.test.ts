/**
 * Unit tests for the email service.
 *
 * We stub `@getbrevo/brevo` so the tests don't try to open network
 * connections. Two behavior paths matter:
 *  - BREVO_API_KEY empty → the dev stub path (no SDK call, logs only)
 *  - BREVO_API_KEY set + SDK throws → return { sent: false }, don't throw
 */

const mockSendTransacEmail = jest.fn();

jest.mock('@getbrevo/brevo', () => {
  return {
    BrevoClient: jest.fn().mockImplementation(() => ({
      transactionalEmails: { sendTransacEmail: mockSendTransacEmail },
    })),
  };
});

import { buildInviteUrl, sendInvitation, _resetBrevoClientForTests } from '@/infrastructure/email/emailService';

describe('buildInviteUrl', () => {
  it('produces a dashboard URL with the token as a query param', () => {
    const url = buildInviteUrl('abc123token');
    expect(url).toMatch(/\/accept-invite\?token=abc123token$/);
  });

  it('URL-encodes the token', () => {
    const url = buildInviteUrl('weird+chars/value=');
    expect(url).toContain('token=weird%2Bchars%2Fvalue%3D');
  });
});

describe('sendInvitation — dev stub path (no API key)', () => {
  const ORIGINAL_KEY = process.env.BREVO_API_KEY;

  beforeEach(() => {
    mockSendTransacEmail.mockReset();
    _resetBrevoClientForTests();
    // Force "missing key" — env.ts already reads this at import time,
    // but env.email.brevoApiKey defaults to '' when unset.
    delete process.env.BREVO_API_KEY;
  });

  afterEach(() => {
    if (ORIGINAL_KEY !== undefined) process.env.BREVO_API_KEY = ORIGINAL_KEY;
  });

  it('skips Brevo entirely and returns sent:true with dev token', async () => {
    const result = await sendInvitation({
      to: 'ama@padlok.com',
      roleName: 'Branch Supervisor',
      inviterName: 'Kwame Asante',
      rawToken: 'token-xyz',
    });

    expect(mockSendTransacEmail).not.toHaveBeenCalled();
    expect(result.sent).toBe(true);
    expect(result.inviteUrl).toMatch(/accept-invite\?token=token-xyz/);
    // NODE_ENV=test is set in tests/setup.ts, so devToken should be exposed.
    expect(result.devToken).toBe('token-xyz');
  });
});

describe('sendInvitation — real path (Brevo SDK mocked)', () => {
  const ORIGINAL_KEY = process.env.BREVO_API_KEY;

  beforeEach(() => {
    mockSendTransacEmail.mockReset();
    _resetBrevoClientForTests();
    process.env.BREVO_API_KEY = 'fake-brevo-key-for-tests';
    // Re-require config/env so it picks up the new BREVO_API_KEY.
    jest.resetModules();
  });

  afterEach(() => {
    if (ORIGINAL_KEY !== undefined) process.env.BREVO_API_KEY = ORIGINAL_KEY;
    else delete process.env.BREVO_API_KEY;
  });

  it('returns sent:false when Brevo throws — never propagates the error', async () => {
    // Re-import AFTER env change so env.email.brevoApiKey reads "fake-brevo-key-for-tests"
    jest.isolateModules(() => {
      // no-op — the below import pulls fresh modules
    });
    const { sendInvitation: send, _resetBrevoClientForTests: reset } =
      jest.requireActual<typeof import('@/infrastructure/email/emailService')>(
        '@/infrastructure/email/emailService',
      );
    reset();

    mockSendTransacEmail.mockRejectedValueOnce(
      Object.assign(new Error('Invalid API key'), {
        body: { message: 'unauthorised' },
      }),
    );

    const result = await send({
      to: 'ama@padlok.com',
      roleName: 'Branch Supervisor',
      inviterName: 'Kwame Asante',
      rawToken: 'token-xyz',
    });

    expect(result.sent).toBe(false);
    expect(result.error).toMatch(/unauthorised|Invalid API key/);
    expect(result.inviteUrl).toMatch(/accept-invite\?token=token-xyz/);
  });

  it('returns sent:true when Brevo accepts the request', async () => {
    const { sendInvitation: send, _resetBrevoClientForTests: reset } =
      jest.requireActual<typeof import('@/infrastructure/email/emailService')>(
        '@/infrastructure/email/emailService',
      );
    reset();

    mockSendTransacEmail.mockResolvedValueOnce({ messageId: 'msg-1' });

    const result = await send({
      to: 'ama@padlok.com',
      roleName: 'Branch Supervisor',
      inviterName: 'Kwame Asante',
      rawToken: 'token-xyz',
    });

    expect(mockSendTransacEmail).toHaveBeenCalledTimes(1);
    const call = mockSendTransacEmail.mock.calls[0][0];
    expect(call.subject).toContain('Branch Supervisor');
    expect(call.to[0].email).toBe('ama@padlok.com');
    expect(call.htmlContent).toContain('Accept Invitation');
    expect(call.textContent).toContain('Kwame Asante');
    expect(result.sent).toBe(true);
  });
});
