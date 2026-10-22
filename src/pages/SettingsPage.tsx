import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ImageUp, KeyRound, Loader2, Trash2, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormError, FormField } from '@/components/common/FormField'
import { PageLoader } from '@/components/common/PageLoader'
import { PageContainer } from '@/components/layout/AppLayout'
import { UserAvatar } from '@/components/layout/UserAvatar'
import { USERNAME_PATTERN, updatePassword } from '@/features/auth/api'
import { useAuth } from '@/features/auth/hooks'
import { updateProfile } from '@/features/profile/api'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { getErrorMessage } from '@/lib/errors'
import { removeImage, uploadImage } from '@/lib/media'

export default function SettingsPage() {
  useDocumentTitle('Настройки')
  const { profile, userId, isLoading } = useAuth()
  if (isLoading || !profile || !userId) return <PageLoader />
  return (
    <PageContainer className="max-w-3xl space-y-8">
      <h1 className="font-display text-2xl font-bold tracking-tight">Настройки</h1>
      <ProfileForm key={profile.updated_at} userId={userId} />
      <PasswordForm />
    </PageContainer>
  )
}

function Section({ icon: Icon, title, children }: { icon: typeof UserCog; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/5 bg-card p-5 sm:p-6">
      <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold">
        <Icon className="size-5 text-primary" aria-hidden /> {title}
      </h2>
      {children}
    </section>
  )
}

function ProfileForm({ userId }: { userId: string }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [values, setValues] = useState({
    username: profile?.username ?? '',
    display_name: profile?.display_name ?? '',
    bio: profile?.bio ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const edit = (patch: Partial<typeof values>) => {
    setValues((v) => ({ ...v, ...patch }))
    setError(null)
  }

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['me'] })
    void queryClient.invalidateQueries({ queryKey: ['profile'] })
  }

  const save = useMutation({
    mutationFn: () => {
      if (!USERNAME_PATTERN.test(values.username)) {
        throw new Error('Имя пользователя: 3–24 символа, латинские буквы, цифры и «_»')
      }
      return updateProfile(userId, {
        username: values.username.trim(),
        display_name: values.display_name.trim() || null,
        bio: values.bio.trim(),
      })
    },
    onSuccess: () => {
      toast.success('Профиль сохранён')
      invalidate()
    },
    onError: (err) => {
      const message = getErrorMessage(err)
      setError(/уже существует/.test(message) ? 'Это имя пользователя уже занято' : message)
    },
  })

  const avatar = useMutation({
    mutationFn: async (file: File | null) => {
      const old = profile?.avatar_path
      const path = file ? await uploadImage(file, 'avatars', userId) : null
      await updateProfile(userId, { avatar_path: path })
      await removeImage(old)
    },
    onSuccess: (_d, file) => {
      toast.success(file ? 'Аватар обновлён' : 'Аватар удалён')
      invalidate()
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    save.mutate()
  }

  return (
    <Section icon={UserCog} title="Профиль">
      <div className="mb-6 flex items-center gap-4">
        <UserAvatar profile={profile} className="size-20 text-lg" />
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Загрузить аватар"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) avatar.mutate(file)
              e.target.value = ''
            }}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={avatar.isPending}>
            {avatar.isPending ? <Loader2 className="animate-spin" /> : <ImageUp />} Загрузить аватар
          </Button>
          {profile?.avatar_path ? (
            <Button variant="ghost" onClick={() => avatar.mutate(null)} disabled={avatar.isPending}>
              <Trash2 /> Удалить
            </Button>
          ) : null}
          <p className="w-full text-xs text-muted-foreground">JPEG, PNG или WebP, до 5 МБ.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Имя пользователя" hint="Используется в адресе профиля">
            {(props) => (
              <Input
                {...props}
                value={values.username}
                maxLength={24}
                onChange={(e) => edit({ username: e.target.value })}
              />
            )}
          </FormField>
          <FormField label="Отображаемое имя">
            {(props) => (
              <Input
                {...props}
                value={values.display_name}
                maxLength={48}
                onChange={(e) => edit({ display_name: e.target.value })}
              />
            )}
          </FormField>
        </div>
        <FormField label="О себе" hint={`${values.bio.length}/1000`}>
          {(props) => (
            <Textarea
              {...props}
              rows={4}
              maxLength={1000}
              value={values.bio}
              onChange={(e) => edit({ bio: e.target.value })}
            />
          )}
        </FormField>
        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : null} Сохранить
          </Button>
        </div>
      </form>
    </Section>
  )
}

function PasswordForm() {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const change = useMutation({
    mutationFn: () => updatePassword(password),
    onSuccess: () => {
      toast.success('Пароль изменён')
      setPassword('')
      setRepeat('')
    },
    onError: (err) => setError(getErrorMessage(err)),
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Пароль должен быть не короче 8 символов')
    if (password !== repeat) return setError('Пароли не совпадают')
    change.mutate()
  }

  return (
    <Section icon={KeyRound} title="Смена пароля">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Новый пароль">
            {(props) => (
              <Input
                {...props}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </FormField>
          <FormField label="Повторите пароль">
            {(props) => (
              <Input
                {...props}
                type="password"
                autoComplete="new-password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              />
            )}
          </FormField>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" disabled={change.isPending || !password}>
            {change.isPending ? <Loader2 className="animate-spin" /> : null} Изменить пароль
          </Button>
        </div>
      </form>
    </Section>
  )
}
