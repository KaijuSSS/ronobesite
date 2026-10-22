import { useState, type FormEvent, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
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
import { getErrorMessage } from '@/lib/errors'
import { REPORT_TARGET_LABELS } from '@/lib/labels'
import type { ReportTarget } from '@/types/database'
import { createReport } from './api'

type ReportDialogProps = {
  targetType: ReportTarget
  targetId: string
  trigger: ReactNode
}

export function ReportDialog({ targetType, targetId, trigger }: ReportDialogProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const mutation = useMutation({
    mutationFn: () => createReport(targetType, targetId, reason),
    onSuccess: () => {
      toast.success('Жалоба отправлена модераторам')
      setOpen(false)
      setReason('')
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Пожаловаться</DialogTitle>
            <DialogDescription>
              {REPORT_TARGET_LABELS[targetType]}: опишите, что не так. Жалобу увидят только модераторы.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="report-reason">Причина</Label>
            <Textarea
              id="report-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={3}
              maxLength={1000}
              required
              rows={4}
              placeholder="Например: нарушение правил, оскорбления, спойлеры без предупреждения…"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={mutation.isPending || reason.trim().length < 3}>
              {mutation.isPending ? 'Отправка…' : 'Отправить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
