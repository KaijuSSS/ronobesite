import { KeyRound, ServerCog, TriangleAlert } from 'lucide-react'
import type { EnvProblem } from '@/lib/env'
import { Logo } from '@/components/layout/Logo'

const STEPS = [
  'Создайте бесплатный проект на supabase.com.',
  'Выполните SQL из папки supabase/migrations (или файл supabase/setup.sql) в SQL Editor.',
  'Скопируйте .env.example в .env.local и укажите Project URL и anon / publishable key.',
  'Перезапустите npm run dev.',
]

/** Экран вместо белого листа, когда Supabase ещё не подключён. */
export function SetupRequired({ problem }: { problem: EnvProblem }) {
  const isSecret = problem === 'secret-key'
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl space-y-8">
        <Logo className="justify-center" />
        <section className="rounded-2xl border bg-card p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
              {isSecret ? <TriangleAlert aria-hidden /> : <ServerCog aria-hidden />}
            </div>
            <h1 className="text-xl font-semibold">
              {isSecret ? 'В настройках указан секретный ключ' : 'Нужно подключить Supabase'}
            </h1>
          </div>

          {isSecret ? (
            <p className="text-sm text-muted-foreground">
              В <code className="rounded bg-muted px-1">VITE_SUPABASE_ANON_KEY</code> указан ключ{' '}
              <b>service_role / secret</b>. Он даёт полный доступ к базе в обход защиты и не должен попадать в браузер.
              Замените его на <b>anon</b> или <b>publishable</b> ключ и смените секретный ключ в панели Supabase.
            </p>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Сайт работает с базой данных Supabase. Пока она не настроена, читать и публиковать нечего — выполните
                шаги ниже.
              </p>
              <ol className="space-y-3">
                {STEPS.map((step, i) => (
                  <li key={step} className="flex gap-3 text-sm">
                    <span className="bg-brand-gradient flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </>
          )}

          <p className="mt-6 flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
            <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden />
            Подробная инструкция — в файле README.md, раздел «Настройка Supabase».
          </p>
        </section>
      </div>
    </main>
  )
}
