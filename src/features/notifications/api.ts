import { getSupabase } from '@/lib/supabase'
import { unwrap, unwrapList } from '@/lib/errors'
import type { NotificationRow } from '@/types/database'

export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await getSupabase()
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
  if (error) throw error
  return count ?? 0
}

export async function fetchNotifications(limit = 50): Promise<NotificationRow[]> {
  return unwrapList(
    await getSupabase().from('notifications').select('*').order('created_at', { ascending: false }).limit(limit),
  )
}

export async function markAllRead(): Promise<void> {
  unwrap(await getSupabase().from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null))
}

export async function markRead(id: string): Promise<void> {
  unwrap(await getSupabase().from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id))
}

export async function deleteNotification(id: string): Promise<void> {
  unwrap(await getSupabase().from('notifications').delete().eq('id', id))
}
