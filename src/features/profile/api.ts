import { getSupabase } from '@/lib/supabase'
import { unwrap, unwrapOne } from '@/lib/errors'
import type { AppRole, ProfileRow } from '@/types/database'

export type PublicProfile = ProfileRow & { roles: AppRole[] }

export async function fetchProfileByUsername(username: string): Promise<PublicProfile | null> {
  const supabase = getSupabase()
  const profile = unwrap(await supabase.from('profiles').select('*').eq('username', username).maybeSingle())
  if (!profile) return null
  const roles = unwrap(await supabase.from('user_roles').select('role').eq('user_id', profile.id)) ?? []
  return { ...profile, roles: roles.map((r) => r.role) }
}

export type ProfileUpdate = Partial<Pick<ProfileRow, 'username' | 'display_name' | 'bio' | 'avatar_path'>>

export async function updateProfile(userId: string, patch: ProfileUpdate): Promise<ProfileRow> {
  return unwrapOne(await getSupabase().from('profiles').update(patch).eq('id', userId).select('*').single())
}
