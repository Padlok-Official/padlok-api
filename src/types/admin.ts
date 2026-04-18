/**
 * Shared TypeScript types for the admin domain.
 * DB row types use snake_case (match Postgres); app-level DTOs use camelCase.
 * Models are responsible for the conversion at the boundary.
 */

export type AdminStatus = 'active' | 'away' | 'inactive' | 'suspended';
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

/** Raw row from the `admins` table. */
export interface AdminRow {
  id: string;
  name: string;
  email: string;
  phone_number: string | null;
  avatar_url: string | null;
  password_hash: string;
  role_id: string;
  status: AdminStatus;
  invited_by: string | null;
  last_active_at: Date | null;
  last_login_at: Date | null;
  last_login_ip: string | null;
  pin_hash: string | null;
  pin_set_at: Date | null;
  pin_attempts: number;
  pin_locked_until: Date | null;
  password_reset_token: string | null;
  password_reset_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/** Safe-to-expose admin summary. Never includes password hash, tokens, PINs. */
export interface AdminDTO {
  id: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  avatarUrl: string | null;
  status: AdminStatus;
  role: {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
  };
  permissions: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminRoleRow {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AdminPermissionRow {
  id: string;
  key: string;
  label: string;
  category: string;
  description: string | null;
}

export interface AdminRefreshTokenRow {
  id: string;
  admin_id: string;
  token_hash: string;
  user_agent: string | null;
  ip_address: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

/** Result of fetching an admin + role + permissions in one round-trip. */
export interface AdminWithPermissions {
  admin: AdminRow;
  role: AdminRoleRow;
  permissions: string[]; // just the keys — that's all requirePermission needs
}
