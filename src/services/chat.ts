import { rawExecute } from './db'

export const webChatApi = {
  async send(sessionId: number, userMessage: string) {
    try {
      // 取 API key
      const keyResult = rawExecute('SELECT value FROM app_setting WHERE key=?', ['deepseek_api_key'])
      const apiKey = keyResult.rows?.[0]?.value as string
      if (!apiKey) return { success: false, message: '請先在設定頁填入 DeepSeek API Key' }

      // 取 DB schema
      const schemaResult = rawExecute(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE '_%' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL`,
      )
      const schema = schemaResult.rows?.map(r => r.sql).join('\n\n') ?? ''

      // 存 user message
      rawExecute('INSERT INTO chat_message (session_id, role, content) VALUES (?, ?, ?)', [sessionId, 'user', userMessage])

      // 取歷史訊息（最近 20 條）
      const historyResult = rawExecute(
        'SELECT role, content FROM chat_message WHERE session_id=? ORDER BY id DESC LIMIT 20',
        [sessionId],
      )
      const history = (historyResult.rows ?? []).reverse().map(r => ({
        role: r.role as string,
        content: r.content as string,
      }))

      const systemPrompt = `你是一個 SQLite 財報資料庫助手。用戶會用自然語言問問題，你需要根據資料庫 schema 回答。

如果用戶的問題需要查詢資料，請生成 SQL 查詢語句。SQL 語句請用 \`\`\`sql 包裹。
只能生成 SELECT 語句，禁止任何修改數據的操作（INSERT/UPDATE/DELETE/DROP）。
回答請使用繁體中文。

以下是資料庫的 schema：

${schema}`

      const messages = [{ role: 'system', content: systemPrompt }, ...history]

      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: 'deepseek-chat', messages, temperature: 0.3, max_tokens: 2048 }),
      })

      if (!response.ok) {
        const errText = await response.text()
        return { success: false, message: `API 錯誤 (${response.status}): ${errText}` }
      }

      const data = await response.json() as any
      const assistantContent = data.choices?.[0]?.message?.content ?? '（無回應）'

      // 提取 SQL
      const sqlMatch = assistantContent.match(/```sql\s*([\s\S]*?)```/)
      const sqlText = sqlMatch?.[1]?.trim() ?? null

      // 如果有 SQL，執行它
      let queryResult = null
      if (sqlText) {
        const upper = sqlText.toUpperCase().trim()
        if (upper.startsWith('SELECT') || upper.startsWith('WITH') || upper.startsWith('EXPLAIN')) {
          try {
            const r = rawExecute(sqlText)
            queryResult = { success: true, ...r }
          } catch (e) {
            queryResult = { success: false, message: String(e) }
          }
        }
      }

      // 存 assistant message
      rawExecute('INSERT INTO chat_message (session_id, role, content, sql_text) VALUES (?, ?, ?, ?)',
        [sessionId, 'assistant', assistantContent, sqlText])

      // 更新 session title
      const msgCount = rawExecute('SELECT COUNT(*) as cnt FROM chat_message WHERE session_id=? AND role=?', [sessionId, 'user'])
      if ((msgCount.rows?.[0] as any)?.cnt <= 1) {
        const title = userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : '')
        rawExecute('UPDATE chat_session SET title=? WHERE id=?', [title, sessionId])
      }

      return { success: true, content: assistantContent, sql: sqlText, queryResult }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  },

  async createSession(): Promise<number | null> {
    rawExecute('INSERT INTO chat_session (title) VALUES (?)', ['新對話'])
    const r = rawExecute('SELECT last_insert_rowid() as id')
    return (r.rows?.[0] as any)?.id ?? null
  },

  async getSessions() {
    const r = rawExecute('SELECT * FROM chat_session ORDER BY created_at DESC')
    return r.rows ?? []
  },

  async getMessages(sessionId: number) {
    const r = rawExecute('SELECT * FROM chat_message WHERE session_id=? ORDER BY id', [sessionId])
    return r.rows ?? []
  },

  async deleteSession(sessionId: number) {
    rawExecute('DELETE FROM chat_message WHERE session_id=?', [sessionId])
    rawExecute('DELETE FROM chat_session WHERE id=?', [sessionId])
  },
}
