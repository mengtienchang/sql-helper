/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  db: {
    execute(sql: string, params?: unknown[]): Promise<{
      success: boolean
      type?: 'select' | 'modify'
      columns?: string[]
      rows?: Record<string, unknown>[]
      changes?: number
      message?: string
    }>
    tables(): Promise<{ success: boolean; tables?: string[]; message?: string }>
    seed(): Promise<{ success: boolean; message?: string }>
  }
  setting: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
  }
  chat: {
    send(sessionId: number, message: string): Promise<{
      success: boolean
      content?: string
      sql?: string | null
      queryResult?: any
      message?: string
    }>
    createSession(): Promise<number | null>
    getSessions(): Promise<{ id: number; title: string; created_at: string }[]>
    getMessages(sessionId: number): Promise<{
      id: number; role: string; content: string; sql_text: string | null; created_at: string
    }[]>
    deleteSession(sessionId: number): Promise<void>
  }
  export: {
    saveTemplate(filePath: string, name: string, desc: string): Promise<{ success: boolean; message?: string }>
    getTemplates(): Promise<{ id: number; name: string; description: string; file_name: string; created_at: string }[]>
    deleteTemplate(id: number): Promise<void>
    scanVars(id: number): Promise<string[]>
    generate(id: number, vars: Record<string, string>): Promise<{ success: boolean; message?: string }>
    simple(data: { columns: string[]; rows: Record<string, unknown>[] }): Promise<{ success: boolean; message?: string }>
    showOpenDialog(): Promise<string | null>
  }
}
