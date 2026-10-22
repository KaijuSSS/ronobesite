import { getSupabase } from '@/lib/supabase'
import { unwrap, unwrapList, unwrapOne } from '@/lib/errors'
import type { AdminUserRow, AppRole, AppSettingsRow, InviteRow } from '@/types/database'

export async function fetchInvites(): Promise<InviteRow[]> {
  return unwrapList(await getSupabase().from('invites').select('*').order('created_at', { ascending: false }).limit(200))
}

export type CreateInviteInput = {
  email: string
  role: AppRole
  maxUses: number
  expiresInDays: number | null
  note: string
}

export async function createInvite(input: CreateInviteInput): Promise<InviteRow> {
  return unwrapOne(
    await getSupabase().rpc('create_invite', {
      _email: input.email.trim() || null,
      _role: input.role,
      _max_uses: input.maxUses,
      _expires_in_days: input.expiresInDays,
      _note: input.note.trim() || null,
    }),
  )
}

export async function revokeInvite(id: string): Promise<void> {
  unwrap(await getSupabase().rpc('revoke_invite', { _invite_id: id }))
}

export async function fetchUsers(): Promise<AdminUserRow[]> {
  return unwrapList(await getSupabase().rpc('admin_list_users'))
}

export async function setUserRole(userId: string, role: AppRole, enabled: boolean): Promise<void> {
  unwrap(await getSupabase().rpc('set_user_role', { _user_id: userId, _role: role, _enabled: enabled }))
}

export async function updateSettings(
  registrationMode: AppSettingsRow['registration_mode'],
  catalogAccess: AppSettingsRow['catalog_access'],
): Promise<void> {
  unwrap(
    await getSupabase().rpc('update_app_settings', {
      _registration_mode: registrationMode,
      _catalog_access: catalogAccess,
    }),
  )
}

export type InviteState = 'active' | 'used' | 'expired' | 'revoked'

export function inviteState(invite: InviteRow, now = Date.now()): InviteState {
  if (invite.revoked_at) return 'revoked'
  if (invite.use_count >= invite.max_uses) return 'used'
  if (invite.expires_at && new Date(invite.expires_at).getTime() < now) return 'expired'
  return 'active'
}
