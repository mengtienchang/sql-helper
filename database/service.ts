import duckdb from 'duckdb'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, dirname } from 'path'

export interface QueryResult {
  type: 'select' | 'modify'
  columns?: string[]
  rows?: Record<string, unknown>[]
  changes?: number
}

export class DatabaseService {
  private db: duckdb.Database | null = null
  private conn: duckdb.Connection | null = null
  private filePath: string
  private migrationsDir: string

  constructor(filePath: string, migrationsDir?: string) {
    this.filePath = filePath
    this.migrationsDir = migrationsDir ?? join(dirname(filePath), 'migrations')
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new duckdb.Database(this.filePath, (err) => {
        if (err) return reject(err)
        this.conn = (this.db as duckdb.Database).connect()
        this.runMigrations().then(resolve).catch(reject)
      })
    })
  }

  async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.conn) throw new Error('Database not initialized')
    const trimmed = sql.trim().toUpperCase()

    const isSelect = trimmed.startsWith('SELECT') ||
      trimmed.startsWith('EXPLAIN') ||
      trimmed.startsWith('SHOW') ||
      trimmed.startsWith('DESCRIBE') ||
      trimmed.startsWith('WITH') ||
      /\bRETURNING\b/.test(trimmed)

    if (isSelect) {
      return new Promise((resolve, reject) => {
        this.conn!.all(sql, ...(params ?? []), (err: Error | null, rows: Record<string, unknown>[]) => {
          if (err) return reject(err)
          const resultRows = rows ?? []
          const columns = resultRows.length > 0 ? Object.keys(resultRows[0]) : []
          resolve({ type: 'select', columns, rows: resultRows })
        })
      })
    } else {
      return new Promise((resolve, reject) => {
        this.conn!.run(sql, ...(params ?? []), (err: Error | null) => {
          if (err) return reject(err)
          resolve({ type: 'modify', changes: 0 })
        })
      })
    }
  }

  async getTables(): Promise<string[]> {
    const result = await this.execute(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'main' AND table_type = 'BASE TABLE'
       AND table_name NOT LIKE '\\_%' ESCAPE '\\'
       ORDER BY table_name`
    )
    return (result.rows ?? []).map(r => r.table_name as string)
  }

  private async runMigrations(): Promise<void> {
    await this.execute(`CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`)

    const result = await this.execute('SELECT name FROM _migrations')
    const executed = new Set((result.rows ?? []).map(r => r.name as string))

    if (!existsSync(this.migrationsDir)) return

    const files = readdirSync(this.migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      if (executed.has(file)) continue
      const sql = readFileSync(join(this.migrationsDir, file), 'utf-8')
      const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0)
      for (const statement of statements) {
        await this.execute(statement)
      }
      await this.execute('INSERT INTO _migrations (name) VALUES (?)', [file])
      console.log(`[migration] executed: ${file}`)
    }
  }

  save(): void {
    // DuckDB auto-persists, no-op
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      this.conn = null
    }
  }
}
