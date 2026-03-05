import { rawExecute } from './db'

async function getSchemaForAI(): Promise<string> {
  const tablesResult = await rawExecute(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' AND table_type = 'BASE TABLE' AND table_name NOT LIKE '\\_%' ESCAPE '\\' ORDER BY table_name`
  )
  const tables = (tablesResult.rows ?? []).map(r => r.table_name as string)
  const schemas: string[] = []
  for (const table of tables) {
    const cols = await rawExecute(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = ? ORDER BY ordinal_position`, [table]
    )
    const colDefs = (cols.rows ?? []).map(c =>
      `  ${c.column_name} ${c.data_type}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}${c.column_default ? ` DEFAULT ${c.column_default}` : ''}`
    ).join(',\n')
    schemas.push(`CREATE TABLE ${table} (\n${colDefs}\n);`)
  }
  return schemas.join('\n\n')
}

export const webChatApi = {
  async send(sessionId: number, userMessage: string) {
    try {
      const keyResult = await rawExecute('SELECT value FROM app_setting WHERE key=?', ['deepseek_api_key'])
      const apiKey = keyResult.rows?.[0]?.value as string
      if (!apiKey) return { success: false, message: '請先在設定頁填入 DeepSeek API Key' }

      const schema = await getSchemaForAI()
      await rawExecute('INSERT INTO chat_message (session_id, role, content) VALUES (?, ?, ?)', [sessionId, 'user', userMessage])

      const historyResult = await rawExecute('SELECT role, content FROM chat_message WHERE session_id=? ORDER BY id DESC LIMIT 20', [sessionId])
      const history = (historyResult.rows ?? []).reverse().map(r => ({ role: r.role as string, content: r.content as string }))

      const systemPrompt = `你是一個 DuckDB 財報資料庫助手。用戶會用自然語言問問題，你需要根據資料庫 schema 回答。

如果用戶的問題需要查詢資料，請生成 SQL 查詢語句。SQL 語句請用 \`\`\`sql 包裹。
只能生成 SELECT 語句，禁止任何修改數據的操作（INSERT/UPDATE/DELETE/DROP）。
回答請使用繁體中文。

以下是資料庫的 schema：

${schema}`

      const messages = [{ role: 'system', content: systemPrompt }, ...history]
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages, temperature: 0.3, max_tokens: 2048 }),
      })

      if (!response.ok) { const errText = await response.text(); return { success: false, message: `API 錯誤 (${response.status}): ${errText}` } }

      const data = await response.json() as any
      const assistantContent = data.choices?.[0]?.message?.content ?? '（無回應）'
      const sqlMatch = assistantContent.match(/```sql\s*([\s\S]*?)```/)
      const sqlText = sqlMatch?.[1]?.trim() ?? null

      let queryResult = null
      if (sqlText) {
        const upper = sqlText.toUpperCase().trim()
        if (upper.startsWith('SELECT') || upper.startsWith('WITH') || upper.startsWith('EXPLAIN')) {
          try { const r = await rawExecute(sqlText); queryResult = { success: true, ...r } }
          catch (e) { queryResult = { success: false, message: String(e) } }
        }
      }

      await rawExecute('INSERT INTO chat_message (session_id, role, content, sql_text) VALUES (?, ?, ?, ?)', [sessionId, 'assistant', assistantContent, sqlText])
      const msgCount = await rawExecute('SELECT COUNT(*) as cnt FROM chat_message WHERE session_id=? AND role=?', [sessionId, 'user'])
      if ((msgCount.rows?.[0] as any)?.cnt <= 1) {
        const title = userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : '')
        await rawExecute('UPDATE chat_session SET title=? WHERE id=?', [title, sessionId])
      }

      return { success: true, content: assistantContent, sql: sqlText, queryResult }
    } catch (error) { return { success: false, message: String(error) } }
  },

  async createSession(): Promise<number | null> {
    const r = await rawExecute('INSERT INTO chat_session (title) VALUES (?) RETURNING id', ['新對話'])
    return (r.rows?.[0] as any)?.id ?? null
  },

  async getSessions() { const r = await rawExecute('SELECT * FROM chat_session ORDER BY created_at DESC'); return r.rows ?? [] },
  async getMessages(sessionId: number) { const r = await rawExecute('SELECT * FROM chat_message WHERE session_id=? ORDER BY id', [sessionId]); return r.rows ?? [] },
  async deleteSession(sessionId: number) { await rawExecute('DELETE FROM chat_message WHERE session_id=?', [sessionId]); await rawExecute('DELETE FROM chat_session WHERE id=?', [sessionId]) },
}
