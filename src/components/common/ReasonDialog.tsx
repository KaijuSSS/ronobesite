import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type ReasonDialogProps = {
  trigger: ReactNode
  title: string
  description?: ReactNode
  label?: string
  placeholder?: string
  confirmLabel: string
  destructive?: boolean
  /** Минимальная длина причины; 0 — причина необязательна. */
  minLength?: number
  /** Действие с причиной. Окно закрывается, когда промис выполнится успешно. */
  onConfirm: (reason: string) => Promise<unknown>
}

/** Подтверждение действия с указанием причины (блокировка, удаление и т. п.). */
export function ReasonDialog({
  trigger,
  title,
  description,
  label = 'Причина',
  placeholder,
  confirmLabel,
  destructive,
  minLength = 5,
  onConfirm,
}: ReasonDialogProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const tooShort = reason.trim().length < minLength

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (tooShort) return
    setPending(true)
    try {
      await onConfirm(reason.trim())
      setOpen(false)
      setReason('')
    } catch {
      // Ошибку показывает вызывающий код (toast); окно остаётся открытым.
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <Textarea
              id={id}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={placeholder}
              required={minLength > 0}
              aria-describedby={`${id}-hint`}
            />
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">
              {minLength > 0 ? `Обязательно, не менее ${minLength} символов.` : 'Необязательно.'}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={pending || tooShort}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
