import { Link, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { PencilLine, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ReasonDialog } from '@/components/common/ReasonDialog'
import { useAuth } from '@/features/auth/hooks'
import { getErrorMessage } from '@/lib/errors'
import { staffDeleteChapter } from './api'

/** Действия модератора под опубликованной главой: исправить текст или удалить главу. */
export function ChapterStaffActions({ bookSlug, chapterId }: { bookSlug: string; chapterId: string }) {
  const { isStaff } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  if (!isStaff) return null

  async function remove(reason: string) {
    try {
      await staffDeleteChapter(chapterId, reason)
    } catch (error) {
      toast.error(getErrorMessage(error))
      throw error
    }
    toast.success('Глава удалена, автор получил уведомление')
    void queryClient.invalidateQueries({ queryKey: ['chapters'] })
    void queryClient.invalidateQueries({ queryKey: ['books'] })
    navigate(`/book/${bookSlug}`, { replace: true })
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-3 font-sans">
      <span className="flex items-center gap-1.5 text-xs text-[color:var(--muted-foreground)]">
        <ShieldCheck className="size-4 text-amber-300" aria-hidden /> Модерация
      </span>
      <Button asChild size="sm" variant="secondary">
        <Link to={`/moderation/edit/${bookSlug}/${chapterId}`}>
          <PencilLine /> Исправить главу
        </Link>
      </Button>
      <ReasonDialog
        trigger={
          <Button size="sm" variant="ghost" className="text-red-300 hover:bg-red-500/10 hover:text-red-200">
            <Trash2 /> Удалить главу
          </Button>
        }
        title="Удалить главу?"
        description="Глава исчезнет у всех читателей вместе с комментариями и лайками. Отменить удаление нельзя. Автор получит уведомление с причиной."
        label="Причина удаления"
        placeholder="Например: нарушает правила сайта"
        confirmLabel="Удалить"
        destructive
        onConfirm={remove}
      />
    </div>
  )
}
