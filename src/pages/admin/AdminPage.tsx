import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Ban, Copy, Globe, Loader2, Lock, Settings2, Ticket, Users } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { FormField } from '@/components/common/FormField'
import { PageContainer } from '@/components/layout/AppLayout'
import {
  createInvite,
  fetchInvites,
  fetchUsers,
  inviteState,
  revokeInvite,
  setUserRole,
  updateSettings,
  type InviteState,
} from '@/features/admin/api'
import { authKeys, useAuth, usePublicConfig } from '@/features/auth/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { appUrl } from '@/lib/app-url'
import { getErrorMessage } from '@/lib/errors'
import { displayName, formatDate, formatRelative } from '@/lib/format'
import { ROLE_LABELS } from '@/lib/labels'
import { cn } from '@/lib/utils'
import type { AppRole, InviteRow } from '@/types/database'

export default function AdminPage() {
  useDocumentTitle('Администрирование')
  return (
    <PageContainer className="space-y-6">
      {/* Длинное слово: на самых узких экранах заголовок чуть меньше, чтобы не вылезал. */}
      <h1 className="font-display text-xl font-bold tracking-tight min-[360px]:text-2xl sm:text-3xl">Администрирование</h1>
      <Tabs defaultValue="invites" className="gap-6">
        <TabsList className="w-full sm:w-fit max-sm:[&_svg]:hidden">
          <TabsTrigger value="invites">
            <Ticket /> Приглашения
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users /> Участники
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings2 /> Доступ
          </TabsTrigger>
        </TabsList>
        <TabsContent value="invites">
          <InvitesTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}

async function copy(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(message)
  } catch {
    toast.error('Не удалось скопировать. Выделите текст вручную.')
  }
}

const INVITE_STATE_LABELS: Record<InviteState, string> = {
  active: 'Активно',
  used: 'Использовано',
  expired: 'Истекло',
  revoked: 'Отозвано',
}

const INVITE_STATE_STYLES: Record<InviteState, string> = {
  active: 'bg-emerald-500/15 text-emerald-300',
  used: 'bg-zinc-500/20 text-zinc-300',
  expired: 'bg-amber-500/15 text-amber-300',
  revoked: 'bg-red-500/15 text-red-300',
}

function InvitesTab() {
  const queryClient = useQueryClient()
  const invites = useQuery({ queryKey: ['admin', 'invites'], queryFn: fetchInvites })
  const [form, setForm] = useState({ email: '', role: 'reader' as AppRole, maxUses: '1', days: '14', note: '' })
  const [created, setCreated] = useState<InviteRow | null>(null)

  const create = useMutation({
    mutationFn: () =>
      createInvite({
        email: form.email,
        role: form.role,
        maxUses: Math.min(100, Math.max(1, Number.parseInt(form.maxUses, 10) || 1)),
        expiresInDays: form.days === 'never' ? null : Number(form.days),
        note: form.note,
      }),
    onSuccess: (invite) => {
      setCreated(invite)
      setForm((f) => ({ ...f, email: '', note: '' }))
      void queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const revoke = useMutation({
    mutationFn: revokeInvite,
    onSuccess: () => {
      toast.success('Приглашение отозвано')
      void queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    create.mutate()
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <section className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-white/5 bg-card p-5">
          <h2 className="font-semibold">Новое приглашение</h2>
          <FormField label="E-mail (необязательно)" hint="Если указан — воспользоваться сможет только этот адрес">
            {(props) => (
              <Input {...props} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            )}
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="invite-role">Роль</Label>
              <Select value={form.role} onValueChange={(role) => setForm({ ...form, role: role as AppRole })}>
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as AppRole[]).map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FormField label="Использований">
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={1}
                  max={100}
                  value={form.maxUses}
                  onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                />
              )}
            </FormField>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-days">Срок действия</Label>
            <Select value={form.days} onValueChange={(days) => setForm({ ...form, days })}>
              <SelectTrigger id="invite-days" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 день</SelectItem>
                <SelectItem value="7">7 дней</SelectItem>
                <SelectItem value="14">14 дней</SelectItem>
                <SelectItem value="30">30 дней</SelectItem>
                <SelectItem value="never">Бессрочно</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <FormField label="Заметка">
            {(props) => (
              <Input
                {...props}
                value={form.note}
                maxLength={200}
                placeholder="Для кого приглашение"
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            )}
          </FormField>
          {form.role !== 'reader' ? (
            <p className="rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-200">
              Новый участник сразу получит роль «{ROLE_LABELS[form.role]}».
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" /> : <Ticket />} Создать приглашение
          </Button>
        </form>

        {created ? (
          <Alert>
            <AlertTitle>Приглашение создано</AlertTitle>
            <AlertDescription className="space-y-2">
              <code className="block rounded-md bg-muted px-2 py-1.5 font-mono text-sm tracking-wider text-foreground">
                {created.code}
              </code>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => void copy(created.code, 'Код скопирован')}>
                  <Copy /> Код
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void copy(appUrl(`/register?invite=${created.code}`), 'Ссылка скопирована')}
                >
                  <Copy /> Ссылка для регистрации
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
      </section>

      <section className="min-w-0">
        {invites.error ? (
          <ErrorState error={invites.error} onRetry={() => void invites.refetch()} />
        ) : invites.isPending ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : invites.data.length === 0 ? (
          <EmptyState icon={Ticket} title="Приглашений пока нет" description="Создайте первое приглашение слева." />
        ) : (
          <ul className="space-y-2">
            {invites.data.map((invite) => {
              const state = inviteState(invite)
              return (
                <li key={invite.id} className="flex flex-col gap-3 rounded-xl border border-white/5 bg-card p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="font-mono text-sm tracking-wider">{invite.code}</code>
                      <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', INVITE_STATE_STYLES[state])}>
                        {INVITE_STATE_LABELS[state]}
                      </span>
                      {invite.role !== 'reader' ? (
                        <span className="rounded-md bg-primary/20 px-2 py-0.5 text-xs text-violet-200">
                          {ROLE_LABELS[invite.role]}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {invite.use_count}/{invite.max_uses} использований
                      {invite.email ? ` · ${invite.email}` : ''}
                      {invite.expires_at ? ` · до ${formatDate(invite.expires_at)}` : ' · бессрочно'}
                      {invite.note ? ` · ${invite.note}` : ''}
                    </p>
                  </div>
                  {state === 'active' ? (
                    <div className="flex gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Скопировать ссылку"
                        onClick={() => void copy(appUrl(`/register?invite=${invite.code}`), 'Ссылка скопирована')}
                      >
                        <Copy />
                      </Button>
                      <ConfirmDialog
                        title="Отозвать приглашение?"
                        description="Код перестанет работать. Уже зарегистрированные участники останутся."
                        confirmLabel="Отозвать"
                        destructive
                        onConfirm={() => revoke.mutate(invite.id)}
                        trigger={
                          <Button size="icon-sm" variant="ghost" aria-label="Отозвать приглашение">
                            <Ban />
                          </Button>
                        }
                      />
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function UsersTab() {
  const { userId } = useAuth()
  const queryClient = useQueryClient()
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: fetchUsers })
  const toggle = useMutation({
    mutationFn: ({ id, role, enabled }: { id: string; role: AppRole; enabled: boolean }) => setUserRole(id, role, enabled),
    onSuccess: () => {
      toast.success('Роли обновлены')
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  if (users.error) return <ErrorState error={users.error} onRetry={() => void users.refetch()} />
  if (users.isPending) return <Skeleton className="h-64 rounded-2xl" />

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        «Автор» может создавать произведения и главы. Модераторы и администраторы могут это всегда, остальные участники
        только читают, оценивают и комментируют.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-white/5 bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">Участники сайта</caption>
          <thead>
            <tr className="border-b border-white/5 text-left text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">
                Участник
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Регистрация
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Автор
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Модератор
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Администратор
              </th>
            </tr>
          </thead>
          <tbody>
            {users.data.map((user) => (
              <tr key={user.id} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-3">
                  <Link to={`/profile/${user.username}`} className="font-medium hover:text-primary">
                    {displayName(user)}
                  </Link>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {formatDate(user.created_at)}
                  {user.last_sign_in_at ? <span className="block">вход {formatRelative(user.last_sign_in_at)}</span> : null}
                </td>
                {(['author', 'moderator', 'admin'] as const).map((role) => {
                  const has = user.roles.includes(role)
                  const self = user.id === userId && role === 'admin'
                  return (
                    <td key={role} className="px-4 py-3">
                      <Switch
                        checked={has}
                        disabled={toggle.isPending || self}
                        aria-label={`${ROLE_LABELS[role]}: ${displayName(user)}`}
                        onCheckedChange={(enabled) => toggle.mutate({ id: user.id, role, enabled })}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SettingsTab() {
  const queryClient = useQueryClient()
  const config = usePublicConfig()
  const save = useMutation({
    mutationFn: (next: { registration: 'invite' | 'open'; catalog: 'members' | 'public' }) =>
      updateSettings(next.registration, next.catalog),
    onSuccess: () => {
      toast.success('Настройки доступа сохранены')
      void queryClient.invalidateQueries({ queryKey: authKeys.config })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  if (config.error) return <ErrorState error={config.error} onRetry={() => void config.refetch()} />
  if (config.isPending) return <Skeleton className="h-48 rounded-2xl" />
  const { registration_mode, catalog_access } = config.data

  return (
    <div className="max-w-2xl space-y-4">
      <Alert>
        <AlertTitle>Сейчас сайт {catalog_access === 'members' ? 'закрыт' : 'открыт для чтения'}</AlertTitle>
        <AlertDescription>
          Эти переключатели позволяют позже открыть сайт без изменения кода. Права проверяются в базе данных: при
          закрытом каталоге гости не получат данные даже прямым запросом к API.
        </AlertDescription>
      </Alert>

      <div className="flex items-start justify-between gap-6 rounded-2xl border border-white/5 bg-card p-5">
        <div className="space-y-1">
          <p className="flex items-center gap-2 font-medium">
            {registration_mode === 'open' ? <Globe className="size-4" /> : <Lock className="size-4" />}
            Открытая регистрация
          </p>
          <p className="text-sm text-muted-foreground">
            Выключено — зарегистрироваться можно только по приглашению. Включено — любой желающий.
          </p>
        </div>
        <ConfirmDialog
          title={registration_mode === 'open' ? 'Закрыть регистрацию?' : 'Открыть регистрацию для всех?'}
          description={
            registration_mode === 'open'
              ? 'Новые участники смогут зарегистрироваться только по приглашению.'
              : 'Любой человек со ссылкой на сайт сможет создать аккаунт. Убедитесь, что настроены SMTP и защита от спама.'
          }
          confirmLabel="Подтвердить"
          onConfirm={() =>
            save.mutate({ registration: registration_mode === 'open' ? 'invite' : 'open', catalog: catalog_access })
          }
          trigger={
            <Switch checked={registration_mode === 'open'} aria-label="Открытая регистрация" disabled={save.isPending} />
          }
        />
      </div>

      <div className="flex items-start justify-between gap-6 rounded-2xl border border-white/5 bg-card p-5">
        <div className="space-y-1">
          <p className="flex items-center gap-2 font-medium">
            {catalog_access === 'public' ? <Globe className="size-4" /> : <Lock className="size-4" />}
            Каталог для гостей
          </p>
          <p className="text-sm text-muted-foreground">
            Включено — опубликованные книги, главы и комментарии видны без входа. Черновики и личные данные остаются
            закрытыми.
          </p>
        </div>
        <ConfirmDialog
          title={catalog_access === 'public' ? 'Закрыть каталог от гостей?' : 'Открыть каталог для гостей?'}
          description={
            catalog_access === 'public'
              ? 'Читать смогут только вошедшие участники.'
              : 'Опубликованные произведения станут доступны любому, у кого есть ссылка на сайт.'
          }
          confirmLabel="Подтвердить"
          onConfirm={() =>
            save.mutate({ registration: registration_mode, catalog: catalog_access === 'public' ? 'members' : 'public' })
          }
          trigger={<Switch checked={catalog_access === 'public'} aria-label="Каталог для гостей" disabled={save.isPending} />}
        />
      </div>
    </div>
  )
}
