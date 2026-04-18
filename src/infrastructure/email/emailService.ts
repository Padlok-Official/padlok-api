/**
 * emailService — outbound email wrapper.
 *
 * Today this is a dev stub: it logs what would be sent. Production will
 * plug into Brevo (or any transactional provider) by implementing the
 * `send` function against their SDK without changing any caller.
 *
 * Dev convenience: in non-production, `sendInvitation` also returns the
 * raw token in the result so the API can include it in its response
 * (for smoke-testing the accept-invite flow without checking email).
 */

import { env } from '@/config/env';
import { logger } from '@/utils/logger';

export interface InvitationEmailInput {
  to: string;
  inviteeName?: string;
  roleName: string;
  inviterName: string;
  rawToken: string;
}

export interface SendInvitationResult {
  sent: boolean;
  inviteUrl: string;
  /** Only populated in non-production to simplify dev testing. */
  devToken?: string;
}

export const buildInviteUrl = (rawToken: string): string =>
  `${env.dashboardUrl.replace(/\/$/, '')}/accept-invite?token=${rawToken}`;

export const sendInvitation = async (
  input: InvitationEmailInput,
): Promise<SendInvitationResult> => {
  const inviteUrl = buildInviteUrl(input.rawToken);

  if (env.isProd && env.email.brevoApiKey) {
    // TODO: implement real Brevo send. Keeping the stub path for now
    // so production deploys without a key still log instead of failing.
    logger.warn('Brevo send not implemented yet — logging invite');
  }

  logger.info(
    {
      to: input.to,
      roleName: input.roleName,
      inviterName: input.inviterName,
      inviteUrl,
    },
    '📧 Invitation email (dev stub)',
  );

  return {
    sent: true,
    inviteUrl,
    devToken: env.isProd ? undefined : input.rawToken,
  };
};
