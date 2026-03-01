declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database
  }

  interface Database {
    run(sql: string, params?: unknown[]): Database
    exec(sql: string): QueryExecResult[]
    prepare(sql: string): Statement
    export(): Uint8Array
    close(): void
    getRowsModified(): number
  }

  interface Statement {
    bind(params?: unknown[]): boolean
    step(): boolean
    get(): unknown[]
    getColumnNames(): string[]
    free(): void
  }

  interface QueryExecResult {
    columns: string[]
    values: unknown[][]
  }

  export type { Database, Statement, SqlJsStatic }
  export default function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>
}
