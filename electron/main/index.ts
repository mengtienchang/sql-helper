import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import * as XLSX from 'xlsx'
import { DatabaseService } from '../../database/service'

let mainWindow: BrowserWindow | null = null
let dbService: DatabaseService | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function initDatabase(): Promise<void> {
  const isDev = !!process.env.VITE_DEV_SERVER_URL
  let dbPath: string
  let migrationsDir: string
  let wasmPath: string | undefined

  if (isDev) {
    // 開發模式：放專案目錄下 data/
    const dataDir = join(process.cwd(), 'data')
    mkdirSync(dataDir, { recursive: true })
    dbPath = join(dataDir, 'financial.db')
    migrationsDir = join(__dirname, '../database/migrations')
  } else {
    // 正式環境：放 userData，migrations 和 wasm 從 extraResources 讀取
    dbPath = join(app.getPath('userData'), 'financial.db')
    migrationsDir = join(process.resourcesPath, 'database/migrations')
    wasmPath = join(process.resourcesPath, 'sql-wasm.wasm')
  }

  console.log('[init] dbPath:', dbPath)
  console.log('[init] migrationsDir:', migrationsDir)
  dbService = new DatabaseService(dbPath, migrationsDir)
  await dbService.init(wasmPath)
  console.log('[init] tables:', dbService.getTables())
}

function registerIpcHandlers(): void {
  ipcMain.handle('db:execute', (_event, sql: string, params?: unknown[]) => {
    if (!dbService) {
      return { success: false, message: 'Database not ready' }
    }
    try {
      const result = dbService.execute(sql, params)
      return { success: true, ...result }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('db:seed', () => {
    console.log('[main] db:seed called')
    if (!dbService) {
      console.log('[main] db not ready')
      return { success: false, message: 'Database not ready' }
    }
    try {
      // 廠區
      const factories = [
        { name: '總部', location: '台北' },
        { name: '廠區A', location: '昆山' },
        { name: '廠區B', location: '深圳' },
      ]
      for (const f of factories) {
        dbService.execute(
          `INSERT OR IGNORE INTO factory (name, location) VALUES (?, ?)`,
          [f.name, f.location]
        )
      }

      // 財報數據
      const periods = ['2023-Q1', '2023-Q2', '2023-Q3', '2023-Q4', '2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4']
      const baseData: Record<string, number> = {
        財報營收: 128500, 產值統計: 125800,
        原材料成本: 51400, 委外加工: 7700, 人工成本: 19280, 變動製費: 6420, 變動管銷研: 3850,
        固定人工: 12850, 廠房設備環境: 8980,
        呆滯提列_報廢: 640, 模具利潤: 1920, 在制半成品影響數: -320, 開關設備折舊: 1600, 稅金附加: 770,
        營業成本_財報: 102800, 營業毛利: 25700, 銷管研: 10280, 財務收支: -1540, 業外收支: 640, 庫存呆滯提列: 960, 庫存呆滯_財報: 320, 稅前淨利: 13260,
        庫存周轉天數_原材料: 45, 庫存周轉天數_在制品: 18, 庫存周轉天數_成品: 22, 庫存周轉天數_模具: 85,
        NB機構件_塑膠: 1.85, NB機構件_鋁皮: 2.40, NB機構件_鎂鋁: 4.50, NB機構件_鋁銑: 6.20, NB機構件_塑膠2: 1.65,
        一體機_五金: 3.80, 桌機_塑膠: 0.95, 桌機_五金: 2.10, 服務器_塑膠: 1.50, 服務器_五金: 3.20,
        通訊通信設備_塑膠: 1.10, 通訊通信設備_五金: 2.80, 集線器_塑膠: 0.75, 電話機_塑膠: 0.60,
        切板板: 0.45, 鈑金: 3.50, 汽車件: 5.80, 電動車: 7.20, 受託加工: 0.85,
        淨利潤: 10580, 流動資產: 185000, 固定資產_平均: 92000, 股東權益_平均: 145000, 總資產_年平均: 298000,
      }

      const columns = Object.keys(baseData)
      const placeholders = columns.map(() => '?').join(', ')
      const insertSql = `INSERT INTO financial_report (period, factory_id, ${columns.join(', ')}) VALUES (?, ?, ${placeholders})`

      const factoryScales = [1.0, 0.7, 0.5]
      for (let fi = 0; fi < factories.length; fi++) {
        for (let pi = 0; pi < periods.length; pi++) {
          const growth = 1 + pi * 0.05
          const values = columns.map(col => {
            const base = baseData[col]
            const scaled = base * factoryScales[fi] * growth
            const jitter = 1 + (Math.random() - 0.5) * 0.06
            return Math.round(scaled * jitter * 100) / 100
          })
          dbService.execute(insertSql, [periods[pi], fi + 1, ...values])
        }
      }

      // 統計指標
      const metrics = [
        { name: '變動成本小計', category: '成本分析',
          sql: `SELECT period, factory_id, (原材料成本 + 委外加工 + 人工成本 + 變動製費 + 變動管銷研) as value FROM financial_report`,
          description: '所有變動成本項目加總', unit: '', thresholds: '' },
        { name: '固定成本小計', category: '成本分析',
          sql: `SELECT period, factory_id, (固定人工 + 廠房設備環境) as value FROM financial_report`,
          description: '所有固定成本項目加總', unit: '', thresholds: '' },
        { name: '產品邊際貢獻', category: '獲利指標',
          sql: `SELECT period, factory_id, (產值統計 - 原材料成本 - 委外加工 - 人工成本 - 變動製費 - 變動管銷研) as value FROM financial_report`,
          description: '產值 - 變動成本', unit: '', thresholds: '' },
        { name: '產品邊際貢獻率', category: '獲利指標',
          sql: `SELECT period, factory_id, ROUND((產值統計 - 原材料成本 - 委外加工 - 人工成本 - 變動製費 - 變動管銷研) * 100.0 / 產值統計, 2) as value FROM financial_report`,
          description: '產品邊際貢獻 / 產值 × 100%', unit: '%', thresholds: JSON.stringify({ good: { min: 30 }, warn: { min: 20 } }) },
        { name: '營業利潤率', category: '獲利指標',
          sql: `SELECT period, factory_id, ROUND((營業毛利 - 銷管研) * 100.0 / 財報營收, 2) as value FROM financial_report`,
          description: '(營業毛利 - 銷管研) / 營收 × 100%', unit: '%', thresholds: JSON.stringify({ good: { min: 10 }, warn: { min: 5 } }) },
        { name: '淨利潤率', category: '獲利指標',
          sql: `SELECT period, factory_id, ROUND(淨利潤 * 100.0 / 財報營收, 2) as value FROM financial_report`,
          description: '淨利潤 / 營收 × 100%', unit: '%', thresholds: JSON.stringify({ good: { min: 8 }, warn: { min: 4 } }) },
        { name: 'ROE', category: '報酬率',
          sql: `SELECT period, factory_id, ROUND(淨利潤 * 100.0 / 股東權益_平均, 2) as value FROM financial_report`,
          description: '淨利潤 / 平均股東權益 × 100%', unit: '%', thresholds: JSON.stringify({ good: { min: 8 }, warn: { min: 4 } }) },
        { name: 'ROA', category: '報酬率',
          sql: `SELECT period, factory_id, ROUND(淨利潤 * 100.0 / 總資產_年平均, 2) as value FROM financial_report`,
          description: '淨利潤 / 平均總資產 × 100%', unit: '%', thresholds: JSON.stringify({ good: { min: 4 }, warn: { min: 2 } }) },
        { name: '損益平衡營收', category: '損益分析',
          sql: `SELECT period, factory_id, ROUND((固定人工 + 廠房設備環境) / ((產值統計 - 原材料成本 - 委外加工 - 人工成本 - 變動製費 - 變動管銷研) * 1.0 / 產值統計), 2) as value FROM financial_report`,
          description: '固定成本 / 邊際貢獻率', unit: '', thresholds: '' },
        { name: '庫存周轉天數合計', category: '營運效率',
          sql: `SELECT period, factory_id, (庫存周轉天數_原材料 + 庫存周轉天數_在制品 + 庫存周轉天數_成品 + 庫存周轉天數_模具) as value FROM financial_report`,
          description: '各類庫存周轉天數加總', unit: '天', thresholds: '' },
      ]
      for (const m of metrics) {
        dbService.execute(
          `INSERT OR IGNORE INTO metric (name, category, sql, description, unit, thresholds) VALUES (?, ?, ?, ?, ?, ?)`,
          [m.name, m.category, m.sql, m.description, m.unit, m.thresholds]
        )
        // 回填舊 DB 的 unit/thresholds
        if (m.unit || m.thresholds) {
          dbService.execute(`UPDATE metric SET unit=?, thresholds=? WHERE name=? AND (unit='' OR unit IS NULL)`, [m.unit, m.thresholds, m.name])
        }
      }

      // 圖表
      const charts = [
        {
          name: '各期營收趨勢', chart_type: 'line',
          sql: `SELECT period, SUM(財報營收) as 營業收入, SUM(營業毛利) as 營業毛利, SUM(淨利潤) as 淨利潤 FROM financial_report GROUP BY period ORDER BY period`,
          x_column: 'period', series_columns: JSON.stringify(['營業收入', '營業毛利', '淨利潤']),
          title: '各期營收與利潤趨勢', y_formatter: '{v}萬', stack: 0, enabled: 1, sort_order: 1,
          description: '營收、毛利、淨利的季度趨勢對比',
        },
        {
          name: '廠區成本結構', chart_type: 'stacked_bar',
          sql: `SELECT f.name as 廠區, SUM(原材料成本) as 原材料, SUM(人工成本) as 人工, SUM(變動製費) as 變動製費, SUM(固定人工) as 固定人工, SUM(廠房設備環境) as 廠房設備 FROM financial_report fr JOIN factory f ON f.id=fr.factory_id GROUP BY f.name`,
          x_column: '廠區', series_columns: JSON.stringify(['原材料', '人工', '變動製費', '固定人工', '廠房設備']),
          title: '各廠區成本結構', y_formatter: '{v}萬', stack: 1, enabled: 1, sort_order: 2,
          description: '各廠區成本組成堆疊比較',
        },
        {
          name: '最新一期成本佔比', chart_type: 'pie',
          sql: `SELECT '原材料' as 類別, SUM(原材料成本) as 金額 FROM financial_report WHERE period=(SELECT MAX(period) FROM financial_report) UNION ALL SELECT '人工', SUM(人工成本) FROM financial_report WHERE period=(SELECT MAX(period) FROM financial_report) UNION ALL SELECT '委外加工', SUM(委外加工) FROM financial_report WHERE period=(SELECT MAX(period) FROM financial_report) UNION ALL SELECT '變動製費', SUM(變動製費) FROM financial_report WHERE period=(SELECT MAX(period) FROM financial_report) UNION ALL SELECT '固定人工', SUM(固定人工) FROM financial_report WHERE period=(SELECT MAX(period) FROM financial_report) UNION ALL SELECT '廠房設備', SUM(廠房設備環境) FROM financial_report WHERE period=(SELECT MAX(period) FROM financial_report)`,
          x_column: '類別', series_columns: JSON.stringify(['金額']),
          title: '最新一期成本佔比', y_formatter: '', stack: 0, enabled: 1, sort_order: 3,
          description: '最新季度各項成本的佔比分析',
        },
        {
          name: '獲利率趨勢', chart_type: 'line',
          sql: `SELECT period, ROUND(SUM(營業毛利)*100.0/SUM(財報營收),2) as 毛利率, ROUND(SUM(營業毛利-銷管研)*100.0/SUM(財報營收),2) as 營業利潤率, ROUND(SUM(淨利潤)*100.0/SUM(財報營收),2) as 淨利潤率 FROM financial_report GROUP BY period ORDER BY period`,
          x_column: 'period', series_columns: JSON.stringify(['毛利率', '營業利潤率', '淨利潤率']),
          title: '獲利率趨勢', y_formatter: '{v}%', stack: 0, enabled: 1, sort_order: 4,
          description: '毛利率、營業利潤率、淨利潤率的季度走勢',
        },
        {
          name: '各廠區營收對比', chart_type: 'bar',
          sql: `SELECT f.name as 廠區, SUM(財報營收) as 營業收入, SUM(淨利潤) as 淨利潤 FROM financial_report fr JOIN factory f ON f.id=fr.factory_id GROUP BY f.name`,
          x_column: '廠區', series_columns: JSON.stringify(['營業收入', '淨利潤']),
          title: '各廠區營收對比', y_formatter: '{v}萬', stack: 0, enabled: 1, sort_order: 5,
          description: '各廠區累計營收與淨利潤比較',
        },
        {
          name: '庫存周轉天數趨勢', chart_type: 'stacked_bar',
          sql: `SELECT period, ROUND(SUM(庫存周轉天數_原材料)/COUNT(*),1) as 原材料, ROUND(SUM(庫存周轉天數_在制品)/COUNT(*),1) as 在制品, ROUND(SUM(庫存周轉天數_成品)/COUNT(*),1) as 成品, ROUND(SUM(庫存周轉天數_模具)/COUNT(*),1) as 模具 FROM financial_report GROUP BY period ORDER BY period`,
          x_column: 'period', series_columns: JSON.stringify(['原材料', '在制品', '成品', '模具']),
          title: '庫存周轉天數趨勢', y_formatter: '{v}天', stack: 1, enabled: 1, sort_order: 6,
          description: '各類庫存周轉天數的季度變化',
        },
      ]
      for (const c of charts) {
        dbService.execute(
          `INSERT OR IGNORE INTO chart (name, chart_type, sql, x_column, series_columns, title, y_formatter, stack, enabled, sort_order, description) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [c.name, c.chart_type, c.sql, c.x_column, c.series_columns, c.title, c.y_formatter, c.stack, c.enabled, c.sort_order, c.description]
        )
      }

      // 儀表板 — 5 個預設模板
      const dashboardDefs = [
        { name: '綜合總覽', description: '一眼看全局：營收、成本、關鍵指標', sort_order: 0 },
        { name: '獲利分析', description: '利潤率與報酬率深入分析', sort_order: 1 },
        { name: '成本分析', description: '各廠區成本結構與損益平衡', sort_order: 2 },
        { name: '營運效率', description: '庫存周轉與產能利用追蹤', sort_order: 3 },
        { name: '報酬率追蹤', description: 'ROE/ROA 與利潤走勢', sort_order: 4 },
      ]
      for (const d of dashboardDefs) {
        dbService.execute(
          `INSERT OR IGNORE INTO dashboard (name, description, sort_order) VALUES (?, ?, ?)`,
          [d.name, d.description, d.sort_order]
        )
      }

      // 取 dashboard/chart/metric ids
      const getId = (table: string, name: string): number | null => {
        const r = dbService!.execute(`SELECT id FROM ${table} WHERE name = ?`, [name])
        return r.rows?.[0]?.id as number ?? null
      }

      // 儀表板內容定義
      const dashboardContents: { dashboard: string; items: { type: string; name: string; span: number }[] }[] = [
        { dashboard: '綜合總覽', items: [
          { type: 'chart', name: '各期營收趨勢', span: 2 },
          { type: 'chart', name: '各廠區營收對比', span: 1 },
          { type: 'chart', name: '最新一期成本佔比', span: 1 },
          { type: 'metric', name: '產品邊際貢獻率', span: 1 },
          { type: 'metric', name: '營業利潤率', span: 1 },
          { type: 'metric', name: '淨利潤率', span: 1 },
          { type: 'metric', name: '庫存周轉天數合計', span: 1 },
        ]},
        { dashboard: '獲利分析', items: [
          { type: 'chart', name: '獲利率趨勢', span: 2 },
          { type: 'chart', name: '各期營收趨勢', span: 2 },
          { type: 'metric', name: '產品邊際貢獻率', span: 1 },
          { type: 'metric', name: '營業利潤率', span: 1 },
          { type: 'metric', name: '淨利潤率', span: 1 },
          { type: 'metric', name: '產品邊際貢獻', span: 1 },
          { type: 'metric', name: 'ROE', span: 1 },
          { type: 'metric', name: 'ROA', span: 1 },
        ]},
        { dashboard: '成本分析', items: [
          { type: 'chart', name: '廠區成本結構', span: 2 },
          { type: 'chart', name: '最新一期成本佔比', span: 1 },
          { type: 'chart', name: '各廠區營收對比', span: 1 },
          { type: 'metric', name: '變動成本小計', span: 1 },
          { type: 'metric', name: '固定成本小計', span: 1 },
          { type: 'metric', name: '損益平衡營收', span: 1 },
          { type: 'metric', name: '產品邊際貢獻率', span: 1 },
        ]},
        { dashboard: '營運效率', items: [
          { type: 'chart', name: '庫存周轉天數趨勢', span: 2 },
          { type: 'chart', name: '各廠區營收對比', span: 1 },
          { type: 'metric', name: '庫存周轉天數合計', span: 1 },
          { type: 'metric', name: '產品邊際貢獻', span: 1 },
          { type: 'metric', name: '損益平衡營收', span: 1 },
        ]},
        { dashboard: '報酬率追蹤', items: [
          { type: 'chart', name: '獲利率趨勢', span: 2 },
          { type: 'chart', name: '廠區成本結構', span: 2 },
          { type: 'metric', name: 'ROE', span: 1 },
          { type: 'metric', name: 'ROA', span: 1 },
          { type: 'metric', name: '營業利潤率', span: 1 },
          { type: 'metric', name: '淨利潤率', span: 1 },
        ]},
      ]

      for (const dc of dashboardContents) {
        const dbId = getId('dashboard', dc.dashboard)
        if (!dbId) continue
        dbService!.execute('DELETE FROM dashboard_item WHERE dashboard_id=?', [dbId])
        dc.items.forEach((item, i) => {
          const itemId = getId(item.type === 'chart' ? 'chart' : 'metric', item.name)
          if (itemId) {
            dbService!.execute(
              `INSERT INTO dashboard_item (dashboard_id, item_type, item_id, col_span, sort_order) VALUES (?,?,?,?,?)`,
              [dbId, item.type, itemId, item.span, i]
            )
          }
        })
      }

      const count = factories.length * periods.length
      console.log(`[main] seed done: ${count} records, ${metrics.length} metrics, ${charts.length} charts, ${dashboardDefs.length} dashboards`)
      return { success: true, message: `已產生 ${count} 筆數據、${metrics.length} 個指標、${charts.length} 個圖表、${dashboardDefs.length} 個儀表板` }
    } catch (error) {
      console.error('[main] seed error:', error)
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('db:tables', () => {
    if (!dbService) {
      return { success: false, message: 'Database not ready' }
    }
    try {
      const tables = dbService.getTables()
      return { success: true, tables }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  // === 設定 ===
  ipcMain.handle('setting:get', (_event, key: string) => {
    if (!dbService) return null
    const r = dbService.execute('SELECT value FROM app_setting WHERE key=?', [key])
    return r.rows?.[0]?.value ?? null
  })

  ipcMain.handle('setting:set', (_event, key: string, value: string) => {
    if (!dbService) return
    dbService.execute(
      `INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      [key, value]
    )
  })

  // === Chat with DeepSeek ===
  ipcMain.handle('chat:send', async (_event, sessionId: number, userMessage: string) => {
    if (!dbService) return { success: false, message: 'Database not ready' }

    try {
      // 取 API key
      const keyResult = dbService.execute('SELECT value FROM app_setting WHERE key=?', ['deepseek_api_key'])
      const apiKey = keyResult.rows?.[0]?.value as string
      if (!apiKey) return { success: false, message: '請先在設定頁填入 DeepSeek API Key' }

      // 取 DB schema
      const schemaResult = dbService.execute(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE '_%' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL`
      )
      const schema = schemaResult.rows?.map(r => r.sql).join('\n\n') ?? ''

      // 存 user message
      dbService.execute(
        'INSERT INTO chat_message (session_id, role, content) VALUES (?, ?, ?)',
        [sessionId, 'user', userMessage]
      )

      // 取歷史訊息（最近 20 條）
      const historyResult = dbService.execute(
        'SELECT role, content FROM chat_message WHERE session_id=? ORDER BY id DESC LIMIT 20',
        [sessionId]
      )
      const history = (historyResult.rows ?? []).reverse().map(r => ({
        role: r.role as string,
        content: r.content as string,
      }))

      // 呼叫 DeepSeek API
      const systemPrompt = `你是一個 SQLite 財報資料庫助手。用戶會用自然語言問問題，你需要根據資料庫 schema 回答。

如果用戶的問題需要查詢資料，請生成 SQL 查詢語句。SQL 語句請用 \`\`\`sql 包裹。
只能生成 SELECT 語句，禁止任何修改數據的操作（INSERT/UPDATE/DELETE/DROP）。
回答請使用繁體中文。

以下是資料庫的 schema：

${schema}`

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
      ]

      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          temperature: 0.3,
          max_tokens: 2048,
        }),
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
        // 安全檢查：只允許 SELECT
        const upper = sqlText.toUpperCase().trim()
        if (upper.startsWith('SELECT') || upper.startsWith('WITH') || upper.startsWith('EXPLAIN')) {
          try {
            queryResult = dbService.execute(sqlText)
          } catch (e) {
            queryResult = { success: false, message: String(e) }
          }
        }
      }

      // 存 assistant message
      dbService.execute(
        'INSERT INTO chat_message (session_id, role, content, sql_text) VALUES (?, ?, ?, ?)',
        [sessionId, 'assistant', assistantContent, sqlText]
      )

      // 更新 session title（第一條訊息時）
      const msgCount = dbService.execute(
        'SELECT COUNT(*) as cnt FROM chat_message WHERE session_id=? AND role=?',
        [sessionId, 'user']
      )
      if ((msgCount.rows?.[0] as any)?.cnt <= 1) {
        const title = userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : '')
        dbService.execute('UPDATE chat_session SET title=? WHERE id=?', [title, sessionId])
      }

      return {
        success: true,
        content: assistantContent,
        sql: sqlText,
        queryResult,
      }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  // === Chat session CRUD ===
  ipcMain.handle('chat:createSession', () => {
    if (!dbService) return null
    dbService.execute('INSERT INTO chat_session (title) VALUES (?)', ['新對話'])
    const r = dbService.execute('SELECT last_insert_rowid() as id')
    return (r.rows?.[0] as any)?.id ?? null
  })

  ipcMain.handle('chat:getSessions', () => {
    if (!dbService) return []
    const r = dbService.execute('SELECT * FROM chat_session ORDER BY created_at DESC')
    return r.rows ?? []
  })

  ipcMain.handle('chat:getMessages', (_event, sessionId: number) => {
    if (!dbService) return []
    const r = dbService.execute(
      'SELECT * FROM chat_message WHERE session_id=? ORDER BY id',
      [sessionId]
    )
    return r.rows ?? []
  })

  ipcMain.handle('chat:deleteSession', (_event, sessionId: number) => {
    if (!dbService) return
    dbService.execute('DELETE FROM chat_message WHERE session_id=?', [sessionId])
    dbService.execute('DELETE FROM chat_session WHERE id=?', [sessionId])
  })

  // ---- Export handlers ----

  ipcMain.handle('file:showOpenDialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths.length) return null
    return filePaths[0]
  })

  ipcMain.handle('export:simple', async (_event, data: { columns: string[], rows: Record<string, unknown>[] }) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: 'export.xlsx',
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      })
      if (canceled || !filePath) return { success: false, message: '已取消' }

      const ws = XLSX.utils.json_to_sheet(data.rows, { header: data.columns })
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
      XLSX.writeFile(wb, filePath)
      return { success: true, message: filePath }
    } catch (err) {
      return { success: false, message: String(err) }
    }
  })

  ipcMain.handle('export:saveTemplate', async (_event, filePath: string, name: string, desc: string) => {
    if (!dbService) return { success: false, message: 'Database not ready' }
    try {
      const buf = readFileSync(filePath)
      const fileName = filePath.split(/[\\/]/).pop() || 'template.xlsx'
      dbService.execute(
        'INSERT INTO export_template (name, description, file_data, file_name) VALUES (?, ?, ?, ?)',
        [name, desc, buf as any, fileName]
      )
      return { success: true }
    } catch (err) {
      return { success: false, message: String(err) }
    }
  })

  ipcMain.handle('export:getTemplates', () => {
    if (!dbService) return []
    const r = dbService.execute('SELECT id, name, description, file_name, created_at FROM export_template ORDER BY id')
    return r.rows ?? []
  })

  ipcMain.handle('export:deleteTemplate', (_event, id: number) => {
    if (!dbService) return
    dbService.execute('DELETE FROM export_template WHERE id=?', [id])
  })

  ipcMain.handle('export:scanVars', (_event, id: number) => {
    if (!dbService) return { success: false, vars: [] }
    try {
      const r = dbService.execute('SELECT file_data FROM export_template WHERE id=?', [id])
      if (!r.rows?.length) return { success: false, vars: [] }
      const buf = (r.rows[0] as any).file_data
      const wb = XLSX.read(buf, { type: 'buffer' })
      const vars = new Set<string>()
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName]
        for (const cellAddr of Object.keys(ws)) {
          if (cellAddr.startsWith('!')) continue
          const cell = ws[cellAddr]
          if (cell && cell.t === 's' && typeof cell.v === 'string') {
            const matches = cell.v.matchAll(/\{\{VAR:([^}]+)\}\}/g)
            for (const m of matches) vars.add(m[1])
          }
        }
      }
      return { success: true, vars: [...vars] }
    } catch (err) {
      return { success: false, vars: [], message: String(err) }
    }
  })

  ipcMain.handle('export:generate', async (_event, id: number, vars: Record<string, string>) => {
    if (!dbService) return { success: false, message: 'Database not ready' }
    try {
      const r = dbService.execute('SELECT file_data, file_name FROM export_template WHERE id=?', [id])
      if (!r.rows?.length) return { success: false, message: '模板不存在' }
      const tmpl = r.rows[0] as any
      const wb = XLSX.read(tmpl.file_data, { type: 'buffer' })

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName]
        const tableCells: { addr: string; sql: string }[] = []

        // First pass: replace SQL and VAR placeholders
        for (const cellAddr of Object.keys(ws)) {
          if (cellAddr.startsWith('!')) continue
          const cell = ws[cellAddr]
          if (!cell || cell.t !== 's' || typeof cell.v !== 'string') continue

          let val = cell.v as string

          // Replace VAR placeholders
          val = val.replace(/\{\{VAR:([^}]+)\}\}/g, (_, name) => vars[name] ?? '')

          // Check for TABLE placeholder
          const tableMatch = val.match(/^\{\{TABLE:(.+)\}\}$/)
          if (tableMatch) {
            tableCells.push({ addr: cellAddr, sql: tableMatch[1] })
            continue
          }

          // Check for SQL placeholder
          const sqlMatch = val.match(/^\{\{SQL:(.+)\}\}$/)
          if (sqlMatch) {
            try {
              const result = dbService!.execute(sqlMatch[1])
              if (result.rows?.length && result.columns?.length) {
                const firstVal = (result.rows[0] as any)[result.columns[0]]
                if (typeof firstVal === 'number') {
                  cell.t = 'n'; cell.v = firstVal
                } else {
                  cell.t = 's'; cell.v = String(firstVal ?? '')
                }
              } else {
                cell.t = 's'; cell.v = ''
              }
            } catch {
              cell.t = 's'; cell.v = '#ERROR'
            }
          } else if (val !== cell.v) {
            cell.v = val
          }
        }

        // Second pass: handle TABLE placeholders (insert rows)
        for (const tc of tableCells) {
          try {
            const result = dbService!.execute(tc.sql)
            if (result.rows?.length && result.columns?.length) {
              const decoded = XLSX.utils.decode_cell(tc.addr)
              const startRow = decoded.r
              const startCol = decoded.c

              // Clear the placeholder cell
              delete ws[tc.addr]

              // Write header row
              result.columns.forEach((col, ci) => {
                const addr = XLSX.utils.encode_cell({ r: startRow, c: startCol + ci })
                ws[addr] = { t: 's', v: col }
              })

              // Write data rows
              result.rows.forEach((row: any, ri) => {
                result.columns!.forEach((col, ci) => {
                  const addr = XLSX.utils.encode_cell({ r: startRow + 1 + ri, c: startCol + ci })
                  const v = row[col]
                  if (typeof v === 'number') {
                    ws[addr] = { t: 'n', v }
                  } else {
                    ws[addr] = { t: 's', v: v == null ? '' : String(v) }
                  }
                })
              })

              // Update sheet range
              const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
              range.e.r = Math.max(range.e.r, startRow + result.rows.length)
              range.e.c = Math.max(range.e.c, startCol + result.columns.length - 1)
              ws['!ref'] = XLSX.utils.encode_range(range)
            } else {
              delete ws[tc.addr]
            }
          } catch {
            ws[tc.addr] = { t: 's', v: '#ERROR' }
          }
        }
      }

      const baseName = tmpl.file_name.replace(/\.xlsx?$/i, '')
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: `${baseName}_匯出.xlsx`,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      })
      if (canceled || !filePath) return { success: false, message: '已取消' }

      XLSX.writeFile(wb, filePath)
      return { success: true, message: filePath }
    } catch (err) {
      return { success: false, message: String(err) }
    }
  })
}

app.whenReady().then(async () => {
  await initDatabase()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (dbService) {
    dbService.close()
    dbService = null
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
