import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'

export interface QueryResult {
  type: 'select' | 'modify'
  columns?: string[]
  rows?: Record<string, unknown>[]
  changes?: number
}

export class DatabaseService {
  private db: SqlJsDatabase | null = null
  private filePath: string
  private migrationsDir: string

  constructor(filePath: string, migrationsDir?: string) {
    this.filePath = filePath
    this.migrationsDir = migrationsDir ?? join(dirname(filePath), 'migrations')
  }

  async init(wasmPath?: string): Promise<void> {
    const initOptions: Record<string, unknown> = {}
    if (wasmPath && existsSync(wasmPath)) {
      initOptions.wasmBinary = readFileSync(wasmPath)
    }
    const SQL = await initSqlJs(initOptions as any)

    if (existsSync(this.filePath)) {
      const buffer = readFileSync(this.filePath)
      this.db = new SQL.Database(buffer)
    } else {
      this.db = new SQL.Database()
    }
    this.runMigrations()
    this.save()
  }

  execute(sql: string, params?: unknown[]): QueryResult {
    if (!this.db) throw new Error('Database not initialized')

    const trimmed = sql.trim().toUpperCase()

    if (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA') || trimmed.startsWith('EXPLAIN')) {
      const stmt = this.db.prepare(sql)
      if (params) stmt.bind(params)

      const columns: string[] = []
      const rows: Record<string, unknown>[] = []

      while (stmt.step()) {
        if (columns.length === 0) {
          columns.push(...stmt.getColumnNames())
        }
        const values = stmt.get()
        const row: Record<string, unknown> = {}
        columns.forEach((col, i) => {
          row[col] = values[i]
        })
        rows.push(row)
      }
      stmt.free()

      return { type: 'select', columns, rows }
    } else {
      this.db.run(sql, params)
      const changes = this.db.getRowsModified()
      this.save()
      return { type: 'modify', changes }
    }
  }

  getTables(): string[] {
    if (!this.db) throw new Error('Database not initialized')
    const stmt = this.db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    )
    const tables: string[] = []
    while (stmt.step()) {
      tables.push(stmt.get()[0] as string)
    }
    stmt.free()
    return tables
  }

  private runMigrations(): void {
    if (!this.db) return

    // 建立 migration 追蹤表
    this.db.run(`CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at TEXT DEFAULT (datetime('now'))
    )`)

    // 讀取已執行的 migration
    const executed = new Set<string>()
    const stmt = this.db.prepare(`SELECT name FROM _migrations`)
    while (stmt.step()) {
      executed.add(stmt.get()[0] as string)
    }
    stmt.free()

    // 讀取 migrations 資料夾中的 .sql 檔案
    if (!existsSync(this.migrationsDir)) return

    const files = readdirSync(this.migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      if (executed.has(file)) continue

      const sql = readFileSync(join(this.migrationsDir, file), 'utf-8')
      const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0)
      for (const statement of statements) {
        this.db.run(statement)
      }
      this.db.run(`INSERT INTO _migrations (name) VALUES (?)`, [file])
      console.log(`[migration] executed: ${file}`)
    }
  }

  save(): void {
    if (!this.db) return
    const data = this.db.export()
    writeFileSync(this.filePath, Buffer.from(data))
  }

  close(): void {
    if (this.db) {
      this.save()
      this.db.close()
      this.db = null
    }
  }
}
