/**
 * emailService — outbound transactional email.
 *
 * Delivery strategy:
 * - If BREVO_API_KEY is set, use Brevo's transactional email API.
 * - If not, fall back to a dev stub that only logs. This lets local dev
 *   (and the test suite) run without external network calls or credentials.
 * - Send failures NEVER throw — the caller has already persisted the row
 *   it needs. We surface failure through the returned `sent: false` flag
 *   so the admin UI can offer a Resend action.
 *
 * Email content:
 * - HTML uses inline styles (email clients strip <style> blocks).
 * - Plaintext fallback always included for clients that prefer it.
 * - Brand color: #033604 (matches dashboard).
 */

import { BrevoClient } from '@getbrevo/brevo';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface InvitationEmailInput {
  to: string;
  inviteeName?: string;
  roleName: string;
  inviterName: string;
  rawToken: string;
  /** Optional — if omitted, defaults to 7 days from now. */
  expiresAt?: Date;
}

export interface SendInvitationResult {
  sent: boolean;
  inviteUrl: string;
  /** Only populated in non-production so dev can test without real email. */
  devToken?: string;
  /** When the provider errored, this carries the reason (for logging only). */
  error?: string;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

export const buildInviteUrl = (rawToken: string): string =>
  `${env.dashboardUrl.replace(/\/$/, '')}/accept-invite?token=${encodeURIComponent(rawToken)}`;

/** Singleton Brevo client — lazily created on first send. */
let brevoClient: BrevoClient | null = null;
const getBrevoClient = (): BrevoClient | null => {
  if (!env.email.brevoApiKey) return null;
  if (!brevoClient) {
    brevoClient = new BrevoClient({ apiKey: env.email.brevoApiKey });
  }
  return brevoClient;
};

const formatExpiry = (date: Date): string =>
  date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

/**
 * Build HTML + plaintext bodies. Kept simple — no CSS classes, only inline
 * styles, and every element has width/font properties so Gmail/Outlook
 * render it consistently.
 */
const buildBodies = (input: InvitationEmailInput, inviteUrl: string) => {
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 7 * 86_400_000);
  const expiryLine = `This invitation expires on ${formatExpiry(expiresAt)}.`;

  const plaintext = [
    `Hi${input.inviteeName ? ` ${input.inviteeName}` : ''},`,
    ``,
    `${input.inviterName} has invited you to join PadLok as a ${input.roleName}.`,
    ``,
    `Accept the invitation and set your password here:`,
    inviteUrl,
    ``,
    expiryLine,
    ``,
    `If you weren't expecting this, you can safely ignore the email.`,
    ``,
    `— The PadLok Team`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#F4F6F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
            <tr>
              <td style="padding:32px 40px 8px 40px;">
                <h1 style="margin:0;font-size:24px;font-weight:700;color:#033604;">Welcome to PadLok 👋</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 40px 24px 40px;font-size:15px;line-height:1.6;color:#4b5563;">
                <strong style="color:#111827;">${escapeHtml(input.inviterName)}</strong> has invited you to join the
                <strong style="color:#111827;">PadLok</strong> admin dashboard as a
                <strong style="color:#033604;">${escapeHtml(input.roleName)}</strong>.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 40px 8px 40px;">
                <a href="${inviteUrl}"
                   style="display:inline-block;background:#033604;color:#ffffff;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:10px;font-size:15px;">
                  Accept Invitation
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 8px 40px;font-size:13px;color:#6b7280;line-height:1.6;">
                ${escapeHtml(expiryLine)}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 40px 32px 40px;font-size:12px;color:#9ca3af;line-height:1.5;word-break:break-all;">
                If the button doesn't work, paste this link into your browser:<br>
                <a href="${inviteUrl}" style="color:#033604;text-decoration:underline;">${inviteUrl}</a>
              </td>
            </tr>
          </table>
          <p style="margin:20px 0 0 0;font-size:12px;color:#9ca3af;">
            If you weren't expecting this, you can safely ignore this email.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { html, plaintext };
};

/** Minimal HTML escape for values we interpolate into the template. */
const escapeHtml = (str: string): string =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

export const sendInvitation = async (
  input: InvitationEmailInput,
): Promise<SendInvitationResult> => {
  const inviteUrl = buildInviteUrl(input.rawToken);
  const devToken = env.isProd ? undefined : input.rawToken;

  const client = getBrevoClient();

  // Dev / missing-key path: log and return success without touching the network.
  if (!client) {
    logger.info(
      {
        to: input.to,
        roleName: input.roleName,
        inviterName: input.inviterName,
        inviteUrl,
      },
      '📧 Invitation email (dev stub — BREVO_API_KEY not set)',
    );
    return { sent: true, inviteUrl, devToken };
  }

  // Real send path
  const { html, plaintext } = buildBodies(input, inviteUrl);

  try {
    const response = await client.transactionalEmails.sendTransacEmail({
      subject: `You've been invited to join PadLok as ${input.roleName}`,
      sender: {
        email: env.email.senderEmail,
        name: env.email.senderName,
      },
      to: [{ email: input.to, name: input.inviteeName ?? input.to }],
      htmlContent: html,
      textContent: plaintext,
      headers: { 'X-Mailer': 'padlok-api' },
    });
    logger.info(
      {
        to: input.to,
        messageId: (response as { messageId?: string } | undefined)?.messageId,
      },
      '📧 Invitation email sent via Brevo',
    );
    return { sent: true, inviteUrl, devToken };
  } catch (err) {
    // Brevo errors wrap the underlying response; grab a useful reason.
    const maybe = err as {
      body?: { message?: string };
      response?: { body?: { message?: string } };
      message?: string;
    };
    const reason =
      maybe?.body?.message ??
      maybe?.response?.body?.message ??
      maybe?.message ??
      'unknown Brevo error';
    logger.warn(
      { err: reason, to: input.to, roleName: input.roleName },
      'Brevo sendInvitation failed — caller will be notified via sent:false',
    );
    return { sent: false, inviteUrl, devToken, error: reason };
  }
};

/**
 * Reset the Brevo client. Used by tests that want to re-initialise after
 * changing env vars; no production callers.
 */
export const _resetBrevoClientForTests = (): void => {
  brevoClient = null;
};
