import { useRef, useState, type FormEvent } from 'react'
import { ImageUp, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { BookCover } from '@/components/books/BookCover'
import { FormError, FormField } from '@/components/common/FormField'
import { useAuth } from '@/features/auth/hooks'
import { useGenres } from '@/features/books/hooks'
import { getErrorMessage } from '@/lib/errors'
import { signMediaPath, uploadImage } from '@/lib/media'
import { WORK_STATUS_LABELS, WORK_STATUSES } from '@/lib/labels'
import { cn } from '@/lib/utils'
import type { WorkStatus } from '@/types/database'
import type { BookFormValues } from './api'
import { MAX_GENRES, validateBookForm } from './validation'

type BookFormProps = {
  initial: BookFormValues
  initialCoverUrl?: string | null
  submitLabel: string
  onSubmit: (values: BookFormValues) => Promise<void>
  /** Скрыть выбор статуса выпуска (для правки опубликованной книги он меняется отдельно). */
  hideStatus?: boolean
  disabled?: boolean
  footer?: React.ReactNode
}

export function BookForm({
  initial,
  initialCoverUrl = null,
  submitLabel,
  onSubmit,
  hideStatus,
  disabled,
  footer,
}: BookFormProps) {
  const { userId } = useAuth()
  const genres = useGenres()
  const fileRef = useRef<HTMLInputElement>(null)
  const [values, setValues] = useState<BookFormValues>(initial)
  const [coverUrl, setCoverUrl] = useState<string | null>(initialCoverUrl)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [uploading, setUploading] = useState(false)

  const patch = (p: Partial<BookFormValues>) => setValues((v) => ({ ...v, ...p }))

  function toggleGenre(id: string) {
    setValues((v) => {
      if (v.genre_ids.includes(id)) return { ...v, genre_ids: v.genre_ids.filter((g) => g !== id) }
      if (v.genre_ids.length >= MAX_GENRES) {
        toast.error(`Можно выбрать не более ${MAX_GENRES} жанров`)
        return v
      }
      return { ...v, genre_ids: [...v.genre_ids, id] }
    })
  }

  async function handleCover(file: File) {
    if (!userId) return
    setUploading(true)
    try {
      const path = await uploadImage(file, 'covers', userId)
      patch({ cover_path: path })
      setCoverUrl(await signMediaPath(path))
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validateBookForm(values)
    setErrors(nextErrors)
    setFormError(null)
    if (Object.keys(nextErrors).length) return
    setPending(true)
    try {
      await onSubmit(values)
    } catch (error) {
      setFormError(getErrorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormError message={formError} />
      <fieldset disabled={disabled || pending} className="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
        <div className="space-y-3">
          <span className="text-sm font-medium">Обложка</span>
          <BookCover title={values.title || 'Без названия'} url={coverUrl} className="w-40 md:w-full" />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Загрузить обложку"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleCover(file)
              e.target.value = ''
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="animate-spin" /> : <ImageUp />} Загрузить
            </Button>
            {values.cover_path ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  patch({ cover_path: null })
                  setCoverUrl(null)
                }}
              >
                <Trash2 /> Убрать
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">JPEG, PNG или WebP до 5 МБ. Лучше 2:3, например 600×900.</p>
        </div>

        <div className="min-w-0 space-y-5">
          <FormField label="Название" error={errors.title}>
            {(props) => (
              <Input {...props} value={values.title} maxLength={200} onChange={(e) => patch({ title: e.target.value })} />
            )}
          </FormField>

          <FormField
            label="Описание"
            hint={`${values.description.length}/5000 · для отправки на проверку нужно не менее 20 символов`}
            error={errors.description}
          >
            {(props) => (
              <Textarea
                {...props}
                rows={7}
                maxLength={5000}
                value={values.description}
                onChange={(e) => patch({ description: e.target.value })}
              />
            )}
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            {hideStatus ? null : (
              <div className="space-y-2">
                <Label htmlFor="book-status">Статус выпуска</Label>
                <Select value={values.status} onValueChange={(status) => patch({ status: status as WorkStatus })}>
                  <SelectTrigger id="book-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WORK_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {WORK_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 rounded-xl border border-white/5 px-4 py-3 sm:mt-6">
              <Label htmlFor="book-adult" className="font-normal">
                Контент 18+
              </Label>
              <Switch id="book-adult" checked={values.is_adult} onCheckedChange={(is_adult) => patch({ is_adult })} />
            </div>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">
              Жанры{' '}
              <span className="font-normal text-muted-foreground">
                ({values.genre_ids.length}/{MAX_GENRES})
              </span>
            </legend>
            {genres.isPending ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 12 }, (_, i) => (
                  <Skeleton key={i} className="h-8 w-24 rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {genres.data?.map((genre) => {
                  const active = values.genre_ids.includes(genre.id)
                  return (
                    <button
                      key={genre.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleGenre(genre.id)}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-sm transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-white/[0.06] text-muted-foreground hover:bg-white/10 hover:text-foreground',
                      )}
                    >
                      {genre.name}
                    </button>
                  )
                })}
              </div>
            )}
            {errors.genres ? <p className="mt-2 text-xs text-destructive">{errors.genres}</p> : null}
          </fieldset>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/5 pt-5">
        {footer}
        <Button type="submit" disabled={disabled || pending || uploading}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
