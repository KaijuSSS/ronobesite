// Собирает все миграции в один файл supabase/setup.sql, чтобы применить
// схему через SQL Editor Supabase одним запуском (без Supabase CLI).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const dir = path.join(root, 'supabase', 'migrations')
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()

const header = `-- Сгенерировано командой npm run db:bundle. Не редактируйте вручную:
-- исходники лежат в supabase/migrations.
-- Выполните этот файл целиком в SQL Editor нового проекта Supabase.
`

const body = files
  .map((file) => `\n-- >>> ${file}\n${readFileSync(path.join(dir, file), 'utf8').trim()}\n`)
  .join('')

writeFileSync(path.join(root, 'supabase', 'setup.sql'), header + body)
console.log(`supabase/setup.sql: ${files.length} миграций`)
