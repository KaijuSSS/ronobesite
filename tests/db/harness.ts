import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const root = path.resolve(import.meta.dirname, '../..')
const migrationsDir = path.join(root, 'supabase/migrations')

export type Actor = { role: 'anon' } | { role: 'authenticated'; userId: string } | { role: 'postgres' }

export const anon: Actor = { role: 'anon' }
export const superuser: Actor = { role: 'postgres' }
export const user = (userId: string): Actor => ({ role: 'authenticated', userId })

export class TestDb {
  readonly pg: PGlite

  private constructor(pg: PGlite) {
    this.pg = pg
  }

  static async create(): Promise<TestDb> {
    const pg = await PGlite.create()
    await pg.exec(readFileSync(path.join(import.meta.dirname, 'supabase-stub.sql'), 'utf8'))

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    for (const file of files) {
      try {
        await pg.exec(readFileSync(path.join(migrationsDir, file), 'utf8'))
      } catch (error) {
        throw new Error(`Миграция ${file} не применилась: ${(error as Error).message}`, { cause: error })
      }
    }
    return new TestDb(pg)
  }

  /** Выполняет запрос от имени указанной роли, как это делает PostgREST. */
  async query<T = Record<string, unknown>>(actor: Actor, sql: string, params: unknown[] = []): Promise<T[]> {
    const claims = actor.role === 'authenticated' ? JSON.stringify({ sub: actor.userId, role: 'authenticated' }) : ''
    await this.pg.query(`select set_config('request.jwt.claims', $1, false)`, [claims])
    if (actor.role !== 'postgres') {
      await this.pg.exec(`set role ${actor.role}`)
    }
    try {
      const result = await this.pg.query<T>(sql, params)
      return result.rows
    } finally {
      await this.pg.exec('reset role')
    }
  }

  async one<T = Record<string, unknown>>(actor: Actor, sql: string, params: unknown[] = []): Promise<T> {
    const rows = await this.query<T>(actor, sql, params)
    if (rows.length !== 1) throw new Error(`Ожидалась одна строка, получено ${rows.length}`)
    return rows[0]
  }

  /** Регистрация пользователя — то же, что делает Supabase Auth при signUp. */
  async signUp(email: string, username: string, inviteCode?: string): Promise<string> {
    const row = await this.one<{ id: string }>(
      superuser,
      `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
      [email, JSON.stringify({ username, invite_code: inviteCode ?? null })],
    )
    return row.id
  }

  async createInvite(code: string, role: 'reader' | 'moderator' | 'admin' = 'reader', maxUses = 1): Promise<void> {
    await this.query(superuser, `insert into public.invites (code, role, max_uses) values ($1, $2, $3)`, [
      code,
      role,
      maxUses,
    ])
  }

  async close(): Promise<void> {
    await this.pg.close()
  }
}

export const sampleDoc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})
