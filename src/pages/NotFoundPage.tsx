import { Link } from 'react-router'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { PageContainer } from '@/components/layout/AppLayout'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export default function NotFoundPage() {
  useDocumentTitle('Страница не найдена')
  return (
    <PageContainer>
      <EmptyState
        icon={Compass}
        title="Страница не найдена"
        description="Похоже, такой страницы нет или ссылка устарела."
        action={
          <>
            <Button asChild>
              <Link to="/">На главную</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/catalog">В каталог</Link>
            </Button>
          </>
        }
      />
    </PageContainer>
  )
}
