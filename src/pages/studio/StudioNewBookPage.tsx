import { Link, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PageContainer } from '@/components/layout/AppLayout'
import { createBook } from '@/features/studio/api'
import { BookForm } from '@/features/studio/BookForm'
import { studioKeys } from '@/features/studio/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export default function StudioNewBookPage() {
  useDocumentTitle('Новое произведение')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return (
    <PageContainer className="max-w-5xl space-y-6">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/studio">
            <ArrowLeft /> Студия
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-bold tracking-tight">Новое произведение</h1>
        <p className="text-sm text-muted-foreground">
          Сохраняется как черновик — его видите только вы. Отправить на проверку можно позже.
        </p>
      </div>
      <section className="rounded-2xl border border-white/5 bg-card p-5 sm:p-6">
        <BookForm
          initial={{ title: '', description: '', status: 'ongoing', is_adult: false, cover_path: null, genre_ids: [] }}
          submitLabel="Создать черновик"
          onSubmit={async (values) => {
            const book = await createBook(values)
            await queryClient.invalidateQueries({ queryKey: studioKeys.all })
            toast.success('Черновик создан. Теперь добавьте главы.')
            navigate(`/studio/books/${book.id}`, { replace: true })
          }}
        />
      </section>
    </PageContainer>
  )
}
