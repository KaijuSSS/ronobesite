import { lazy, type ComponentType, type ReactNode } from 'react'
import { createHashRouter, type RouteObject } from 'react-router'
import { AppLayout } from '@/components/layout/AppLayout'
import { RouteErrorBoundary } from '@/components/common/RouteErrorBoundary'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { RedirectIfAuthenticated, RequireAuth, RequireMember, RequireRole } from '@/features/auth/guards'
import { WRITER_ROLES } from '@/features/auth/hooks'
import HomePage from '@/pages/HomePage'
import LoginPage from '@/pages/auth/LoginPage'
import NotFoundPage from '@/pages/NotFoundPage'

// Тяжёлые разделы (редактор Tiptap, модерация, админка) грузятся по требованию.
const CatalogPage = lazy(() => import('@/pages/CatalogPage'))
const BookPage = lazy(() => import('@/pages/BookPage'))
const ReaderPage = lazy(() => import('@/pages/ReaderPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const LibraryPage = lazy(() => import('@/pages/LibraryPage'))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'))
const StudioPage = lazy(() => import('@/pages/studio/StudioPage'))
const StudioNewBookPage = lazy(() => import('@/pages/studio/StudioNewBookPage'))
const StudioBookPage = lazy(() => import('@/pages/studio/StudioBookPage'))
const ChapterEditorPage = lazy(() => import('@/pages/studio/ChapterEditorPage'))
const ModerationPage = lazy(() => import('@/pages/moderation/ModerationPage'))
const ModerationItemPage = lazy(() => import('@/pages/moderation/ModerationItemPage'))
const StaffChapterEditPage = lazy(() => import('@/pages/moderation/StaffChapterEditPage'))
const AdminPage = lazy(() => import('@/pages/admin/AdminPage'))

type Guard = (props: { children: ReactNode }) => ReactNode

function guarded(Guard: Guard, Page: ComponentType) {
  return (
    <Guard>
      <Page />
    </Guard>
  )
}

const writer: Guard = ({ children }) => (
  <RequireRole
    roles={WRITER_ROLES}
    description="Публиковать произведения могут только авторы. Попросите администратора выдать вам роль «Автор»."
  >
    {children}
  </RequireRole>
)
const staff: Guard = ({ children }) => <RequireRole roles={['moderator', 'admin']}>{children}</RequireRole>
const admin: Guard = ({ children }) => <RequireRole roles={['admin']}>{children}</RequireRole>
const guest: Guard = ({ children }) => <RedirectIfAuthenticated>{children}</RedirectIfAuthenticated>

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'catalog', element: guarded(RequireMember, CatalogPage) },
      { path: 'book/:slug', element: guarded(RequireMember, BookPage) },
      { path: 'profile/:username', element: guarded(RequireMember, ProfilePage) },
      { path: 'library', element: guarded(RequireAuth, LibraryPage) },
      { path: 'notifications', element: guarded(RequireAuth, NotificationsPage) },
      { path: 'settings', element: guarded(RequireAuth, SettingsPage) },
      { path: 'studio', element: guarded(writer, StudioPage) },
      { path: 'studio/new', element: guarded(writer, StudioNewBookPage) },
      { path: 'studio/books/:bookId', element: guarded(writer, StudioBookPage) },
      { path: 'studio/books/:bookId/chapters/:chapterId', element: guarded(writer, ChapterEditorPage) },
      { path: 'moderation', element: guarded(staff, ModerationPage) },
      { path: 'moderation/:queueId', element: guarded(staff, ModerationItemPage) },
      { path: 'moderation/edit/:slug/:chapterId', element: guarded(staff, StaffChapterEditPage) },
      { path: 'admin', element: guarded(admin, AdminPage) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    // Читалка — отдельный полноэкранный макет со своими темами.
    path: '/book/:slug/chapter/:chapterId',
    element: guarded(RequireMember, ReaderPage),
    errorElement: <RouteErrorBoundary />,
  },
  {
    element: <AuthLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: 'login', element: guarded(guest, LoginPage) },
      { path: 'register', element: guarded(guest, RegisterPage) },
      { path: 'forgot-password', element: guarded(guest, ForgotPasswordPage) },
      { path: 'reset-password', element: <ResetPasswordPage /> },
    ],
  },
]

/**
 * HashRouter: GitHub Pages не умеет отдавать index.html для произвольных
 * путей, а адреса вида /#/book/... открываются напрямую без ошибки 404.
 */
export function createAppRouter() {
  return createHashRouter(routes)
}
