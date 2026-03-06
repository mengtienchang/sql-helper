import * as duckdb from '@duckdb/duckdb-wasm'

// ---- Embedded migrations (DuckDB syntax) ----
const MIGRATIONS: { name: string; sql: string }[] = [
  { name: '001_create_financial_report.sql', sql: `CREATE TABLE IF NOT EXISTS financial_report (id INTEGER PRIMARY KEY, period TEXT NOT NULL, 財報營收 REAL, 產值統計 REAL, 原材料成本 REAL, 委外加工 REAL, 人工成本 REAL, 變動製費 REAL, 變動管銷研 REAL, 固定人工 REAL, 廠房設備環境 REAL, 呆滯提列_報廢 REAL, 模具利潤 REAL, 在制半成品影響數 REAL, 開關設備折舊 REAL, 稅金附加 REAL, 營業成本_財報 REAL, 營業毛利 REAL, 銷管研 REAL, 財務收支 REAL, 業外收支 REAL, 庫存呆滯提列 REAL, 庫存呆滯_財報 REAL, 稅前淨利 REAL, 庫存周轉天數_原材料 REAL, 庫存周轉天數_在制品 REAL, 庫存周轉天數_成品 REAL, 庫存周轉天數_模具 REAL, NB機構件_塑膠 REAL, NB機構件_鋁皮 REAL, NB機構件_鎂鋁 REAL, NB機構件_鋁銑 REAL, NB機構件_塑膠2 REAL, 一體機_五金 REAL, 桌機_塑膠 REAL, 桌機_五金 REAL, 服務器_塑膠 REAL, 服務器_五金 REAL, 通訊通信設備_塑膠 REAL, 通訊通信設備_五金 REAL, 集線器_塑膠 REAL, 電話機_塑膠 REAL, 切板板 REAL, 鈑金 REAL, 汽車件 REAL, 電動車 REAL, 受託加工 REAL, 淨利潤 REAL, 流動資產 REAL, 固定資產_平均 REAL, 股東權益_平均 REAL, 總資產_年平均 REAL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
  { name: '002_create_factory.sql', sql: `CREATE TABLE IF NOT EXISTS factory (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, location TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);ALTER TABLE financial_report ADD COLUMN factory_id INTEGER` },
  { name: '003_create_metric.sql', sql: `CREATE TABLE IF NOT EXISTS metric (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, category TEXT NOT NULL, sql TEXT NOT NULL, description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
  { name: '004_create_chart.sql', sql: `CREATE TABLE IF NOT EXISTS chart (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, chart_type TEXT NOT NULL DEFAULT 'line', sql TEXT NOT NULL, x_column TEXT NOT NULL, series_columns TEXT NOT NULL DEFAULT '[]', title TEXT, y_formatter TEXT, stack INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
  { name: '005_create_dashboard.sql', sql: `CREATE TABLE IF NOT EXISTS dashboard (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS dashboard_item (id INTEGER PRIMARY KEY, dashboard_id INTEGER NOT NULL, item_type TEXT NOT NULL, item_id INTEGER NOT NULL, col_span INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0)` },
  { name: '006_create_chat.sql', sql: `CREATE TABLE IF NOT EXISTS chat_session (id INTEGER PRIMARY KEY, title TEXT DEFAULT '新對話', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS chat_message (id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, sql_text TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS app_setting (key TEXT PRIMARY KEY, value TEXT NOT NULL)` },
  { name: '007_metric_thresholds.sql', sql: `ALTER TABLE metric ADD COLUMN unit TEXT DEFAULT '';ALTER TABLE metric ADD COLUMN thresholds TEXT DEFAULT ''` },
  { name: '008_create_export_template.sql', sql: `CREATE TABLE IF NOT EXISTS export_template (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT, file_data BLOB NOT NULL, file_name TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
  { name: '009_chart_category.sql', sql: `ALTER TABLE chart ADD COLUMN category TEXT DEFAULT ''` },
  { name: '010_dashboard_story.sql', sql: `ALTER TABLE dashboard ADD COLUMN analysis TEXT DEFAULT '';ALTER TABLE dashboard ADD COLUMN actions TEXT DEFAULT ''` },
]

// ---- DuckDB WASM Database ----
let db: duckdb.AsyncDuckDB | null = null
let conn: duckdb.AsyncDuckDBConnection | null = null

interface QueryResult {
  type: 'select' | 'modify'
  columns?: string[]
  rows?: Record<string, unknown>[]
  changes?: number
}

async function execute(sql: string, params?: unknown[]): Promise<QueryResult> {
  if (!conn) throw new Error('Database not initialized')
  const trimmed = sql.trim().toUpperCase()

  const isSelect = trimmed.startsWith('SELECT') ||
    trimmed.startsWith('EXPLAIN') ||
    trimmed.startsWith('SHOW') ||
    trimmed.startsWith('DESCRIBE') ||
    trimmed.startsWith('WITH') ||
    /\bRETURNING\b/.test(trimmed)

  if (isSelect) {
    let result
    if (params && params.length > 0) {
      const stmt = await conn.prepare(sql)
      result = await stmt.query(...params as any[])
      await stmt.close()
    } else {
      result = await conn.query(sql)
    }
    const columns = result.schema.fields.map(f => f.name)
    const rows: Record<string, unknown>[] = []
    for (let i = 0; i < result.numRows; i++) {
      const row: Record<string, unknown> = {}
      for (const col of columns) {
        const vec = result.getChild(col)
        let v = vec?.get(i)
        if (typeof v === 'bigint') v = Number(v)
        row[col] = v
      }
      rows.push(row)
    }
    return { type: 'select', columns, rows }
  } else {
    if (params && params.length > 0) {
      const stmt = await conn.prepare(sql)
      await stmt.send(...params as any[])
      await stmt.close()
    } else {
      await conn.query(sql)
    }
    return { type: 'modify', changes: 0 }
  }
}

async function runMigrations(): Promise<void> {
  await execute(`CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  const result = await execute('SELECT name FROM _migrations')
  const executed = new Set((result.rows ?? []).map(r => r.name as string))

  for (const m of MIGRATIONS) {
    if (executed.has(m.name)) continue
    try {
      const statements = m.sql.split(';').map(s => s.trim()).filter(s => s.length > 0)
      for (const s of statements) {
        try { await execute(s) } catch (err) { console.warn(`[migration] ${m.name} statement failed:`, err) }
      }
      await execute('INSERT INTO _migrations (name) VALUES (?)', [m.name])
      console.log(`[migration] executed: ${m.name}`)
    } catch (err) {
      console.error(`[migration] ${m.name} failed:`, err)
    }
  }
}

async function createWorkerFromURL(url: string): Promise<Worker> {
  const resp = await fetch(url)
  const blob = new Blob([await resp.text()], { type: 'application/javascript' })
  return new Worker(URL.createObjectURL(blob))
}

export async function initWebDB(): Promise<void> {
  const BUNDLES = duckdb.getJsDelivrBundles()
  const bundle = await duckdb.selectBundle(BUNDLES)

  const worker = await createWorkerFromURL(bundle.mainWorker!)
  const logger = new duckdb.ConsoleLogger()
  db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  await db.open({ path: ':memory:' })
  conn = await db.connect()

  await runMigrations()
  console.log('[web-db] initialized with DuckDB WASM')
}

export function getDB() { return db }

// ---- seed data ----
async function seed() {
  if (!conn) return { success: false, message: 'Database not ready' }
  try {
    await execute('DELETE FROM dashboard_item')
    await execute('DELETE FROM dashboard')
    await execute('DELETE FROM chart')
    await execute('DELETE FROM metric')
    await execute('DELETE FROM financial_report')
    await execute('DELETE FROM factory')

    const factories = [
      { name: '總部', location: '台北' }, { name: '廠區A', location: '昆山' }, { name: '廠區B', location: '深圳' }, { name: '廠區C', location: '東莞' },
      { name: '廠區D', location: '蘇州' }, { name: '廠區E', location: '重慶' }, { name: '廠區F', location: '成都' }, { name: '廠區G', location: '武漢' },
    ]
    const factoryIds: number[] = []
    for (const f of factories) {
      const r = await execute(
        'INSERT INTO factory (name, location) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET location=excluded.location RETURNING id',
        [f.name, f.location]
      )
      factoryIds.push(r.rows![0]!.id as number)
    }

    const periods = ['2023-Q1','2023-Q2','2023-Q3','2023-Q4','2024-Q1','2024-Q2','2024-Q3','2024-Q4','2025-Q1','2025-Q2','2025-Q3','2025-Q4']
    const baseData: Record<string, number> = {
      財報營收: 128500, 產值統計: 125800, 原材料成本: 51400, 委外加工: 7700, 人工成本: 19280, 變動製費: 6420, 變動管銷研: 3850,
      固定人工: 12850, 廠房設備環境: 8980, 呆滯提列_報廢: 640, 模具利潤: 1920, 在制半成品影響數: -320, 開關設備折舊: 1600, 稅金附加: 770,
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
    const factoryScales = [1.0, 0.7, 0.5, 0.6, 0.45, 0.55, 0.4, 0.35]
    for (let fi = 0; fi < factories.length; fi++) {
      for (let pi = 0; pi < periods.length; pi++) {
        const growth = 1 + pi * 0.04
        const values = columns.map(col => { const base = baseData[col]; const scaled = base * factoryScales[fi] * growth; const jitter = 1 + (Math.random() - 0.5) * 0.08; return Math.round(scaled * jitter * 100) / 100 })
        await execute(insertSql, [periods[pi], factoryIds[fi], ...values])
      }
    }

    const metrics = [
      { name: '變動成本小計', category: '成本分析', sql: `SELECT period, factory_id, (原材料成本 + 委外加工 + 人工成本 + 變動製費 + 變動管銷研) as value FROM financial_report`, description: '所有變動成本項目加總', unit: '', thresholds: '' },
      { name: '固定成本小計', category: '成本分析', sql: `SELECT period, factory_id, (固定人工 + 廠房設備環境) as value FROM financial_report`, description: '所有固定成本項目加總', unit: '', thresholds: '' },
      { name: '產品邊際貢獻', category: '獲利指標', sql: `SELECT period, factory_id, (產值統計 - 原材料成本 - 委外加工 - 人工成本 - 變動製費 - 變動管銷研) as value FROM financial_report`, description: '產值 - 變動成本', unit: '', thresholds: '' },
      { name: '產品邊際貢獻率', category: '獲利指標', sql: `SELECT period, factory_id, ROUND((產值統計 - 原材料成本 - 委外加工 - 人工成本 - 變動製費 - 變動管銷研) * 100.0 / 產值統計, 2) as value FROM financial_report`, description: '產品邊際貢獻 / 產值 × 100%', unit: '%', thresholds: JSON.stringify({ good: { min: 30 }, warn: { min: 20 } }) },
      { name: '營業利潤率', category: '獲利指標', sql: `SELECT period, factory_id, ROUND((營業毛利 - 銷管研) * 100.0 / 財報營收, 2) as value FROM financial_report`, description: '(營業毛利 - 銷管研) / 營收 × 100%', unit: '%', thresholds: JSON.stringify({ good: { min: 10 }, warn: { min: 5 } }) },
      { name: '淨利潤率', category: '獲利指標', sql: `SELECT period, factory_id, ROUND(淨利潤 * 100.0 / 財報營收, 2) as value FROM financial_report`, description: '淨利潤 / 營收 × 100%', unit: '%', thresholds: JSON.stringify({ good: { min: 8 }, warn: { min: 4 } }) },
      { name: 'ROE', category: '報酬率', sql: `SELECT period, factory_id, ROUND(淨利潤 * 100.0 / 股東權益_平均, 2) as value FROM financial_report`, description: '淨利潤 / 平均股東權益 × 100%', unit: '%', thresholds: JSON.stringify({ good: { min: 8 }, warn: { min: 4 } }) },
      { name: 'ROA', category: '報酬率', sql: `SELECT period, factory_id, ROUND(淨利潤 * 100.0 / 總資產_年平均, 2) as value FROM financial_report`, description: '淨利潤 / 平均總資產 × 100%', unit: '%', thresholds: JSON.stringify({ good: { min: 4 }, warn: { min: 2 } }) },
      { name: '損益平衡營收', category: '損益分析', sql: `SELECT period, factory_id, ROUND((固定人工 + 廠房設備環境) / ((產值統計 - 原材料成本 - 委外加工 - 人工成本 - 變動製費 - 變動管銷研) * 1.0 / 產值統計), 2) as value FROM financial_report`, description: '固定成本 / 邊際貢獻率', unit: '', thresholds: '' },
      { name: '庫存周轉天數合計', category: '營運效率', sql: `SELECT period, factory_id, (庫存周轉天數_原材料 + 庫存周轉天數_在制品 + 庫存周轉天數_成品 + 庫存周轉天數_模具) as value FROM financial_report`, description: '各類庫存周轉天數加總', unit: '天', thresholds: '' },
    ]
    for (const m of metrics) {
      await execute('INSERT INTO metric (name, category, sql, description, unit, thresholds) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(name) DO NOTHING', [m.name, m.category, m.sql, m.description, m.unit, m.thresholds])
      if (m.unit || m.thresholds) { await execute(`UPDATE metric SET unit=?, thresholds=? WHERE name=? AND (unit='' OR unit IS NULL)`, [m.unit, m.thresholds, m.name]) }
    }

    const charts = [
      { name: '營收利潤趨勢', chart_type: 'line', category: '時間', sql: `SELECT period, SUM(財報營收) as 營業收入, SUM(營業毛利) as 營業毛利, SUM(淨利潤) as 淨利潤 FROM financial_report GROUP BY period ORDER BY period`, x_column: 'period', series_columns: JSON.stringify(['營業收入', '營業毛利', '淨利潤']), title: '營收與利潤趨勢', y_formatter: '{v}萬', stack: 0, enabled: 1, sort_order: 1, description: '營收、毛利、淨利的季度趨勢對比' },
      { name: '獲利率趨勢', chart_type: 'line', category: '時間', sql: `SELECT period, ROUND(SUM(營業毛利)*100.0/SUM(財報營收),2) as 毛利率, ROUND(SUM(營業毛利-銷管研)*100.0/SUM(財報營收),2) as 營業利潤率, ROUND(SUM(淨利潤)*100.0/SUM(財報營收),2) as 淨利潤率 FROM financial_report GROUP BY period ORDER BY period`, x_column: 'period', series_columns: JSON.stringify(['毛利率', '營業利潤率', '淨利潤率']), title: '獲利率趨勢', y_formatter: '{v}%', stack: 0, enabled: 1, sort_order: 2, description: '毛利率、營業利潤率、淨利潤率的季度走勢' },
      { name: '成本趨勢', chart_type: 'stacked_bar', category: '時間', sql: `SELECT period, SUM(原材料成本) as 原材料, SUM(人工成本) as 人工, SUM(委外加工) as 委外加工, SUM(變動製費) as 變動製費, SUM(固定人工) as 固定人工, SUM(廠房設備環境) as 廠房設備 FROM financial_report GROUP BY period ORDER BY period`, x_column: 'period', series_columns: JSON.stringify(['原材料', '人工', '委外加工', '變動製費', '固定人工', '廠房設備']), title: '各期成本結構', y_formatter: '{v}萬', stack: 1, enabled: 1, sort_order: 3, description: '各期成本項目堆疊趨勢' },
      { name: '庫存周轉天數趨勢', chart_type: 'stacked_bar', category: '時間', sql: `SELECT period, ROUND(SUM(庫存周轉天數_原材料)/COUNT(*),1) as 原材料, ROUND(SUM(庫存周轉天數_在制品)/COUNT(*),1) as 在制品, ROUND(SUM(庫存周轉天數_成品)/COUNT(*),1) as 成品, ROUND(SUM(庫存周轉天數_模具)/COUNT(*),1) as 模具 FROM financial_report GROUP BY period ORDER BY period`, x_column: 'period', series_columns: JSON.stringify(['原材料', '在制品', '成品', '模具']), title: '庫存周轉天數趨勢', y_formatter: '{v}天', stack: 1, enabled: 1, sort_order: 4, description: '各類庫存周轉天數的季度變化' },
      { name: '廠區營收對比', chart_type: 'bar', category: '廠區', sql: `SELECT f.name as 廠區, SUM(財報營收) as 營業收入, SUM(營業毛利) as 營業毛利, SUM(淨利潤) as 淨利潤 FROM financial_report fr JOIN factory f ON f.id=fr.factory_id GROUP BY f.name`, x_column: '廠區', series_columns: JSON.stringify(['營業收入', '營業毛利', '淨利潤']), title: '各廠區營收與利潤', y_formatter: '{v}萬', stack: 0, enabled: 1, sort_order: 10, description: '各廠區累計營收、毛利與淨利潤比較' },
      { name: '廠區成本結構', chart_type: 'stacked_bar', category: '廠區', sql: `SELECT f.name as 廠區, SUM(原材料成本) as 原材料, SUM(人工成本) as 人工, SUM(變動製費) as 變動製費, SUM(固定人工) as 固定人工, SUM(廠房設備環境) as 廠房設備 FROM financial_report fr JOIN factory f ON f.id=fr.factory_id GROUP BY f.name`, x_column: '廠區', series_columns: JSON.stringify(['原材料', '人工', '變動製費', '固定人工', '廠房設備']), title: '各廠區成本結構', y_formatter: '{v}萬', stack: 1, enabled: 1, sort_order: 11, description: '各廠區成本組成堆疊比較' },
      { name: '最新一期成本佔比', chart_type: 'pie', category: '廠區', sql: `SELECT '原材料' as 類別, SUM(原材料成本) as 金額 FROM financial_report WHERE period=(SELECT MAX(period) FROM financial_report) UNION ALL SELECT '人工', SUM(人工成本) FROM financial_report WHERE period=(SELECT MAX(period) FROM financial_report) UNION ALL SELECT '委外加工', SUM(委外加工) FROM financial_report WHERE period=(SELECT MAX(period) FROM financial_report) UNION ALL SELECT '變動製費', SUM(變動製費) FROM financial_report WHERE period=(SELECT MAX(period) FROM financial_report) UNION ALL SELECT '固定人工', SUM(固定人工) FROM financial_report WHERE period=(SELECT MAX(period) FROM financial_report) UNION ALL SELECT '廠房設備', SUM(廠房設備環境) FROM financial_report WHERE period=(SELECT MAX(period) FROM financial_report)`, x_column: '類別', series_columns: JSON.stringify(['金額']), title: '最新一期成本佔比', y_formatter: '', stack: 0, enabled: 1, sort_order: 15, description: '最新季度各項成本的佔比分析' },
      { name: '廠區營收佔比', chart_type: 'pie', category: '廠區', sql: `SELECT f.name as 廠區, SUM(財報營收) as 營收 FROM financial_report fr JOIN factory f ON f.id=fr.factory_id GROUP BY f.name`, x_column: '廠區', series_columns: JSON.stringify(['營收']), title: '各廠區營收佔比', y_formatter: '', stack: 0, enabled: 1, sort_order: 16, description: '各廠區營收佔總體比例' },
    ]
    for (const c of charts) {
      await execute('INSERT INTO chart (name, chart_type, sql, x_column, series_columns, title, y_formatter, stack, enabled, sort_order, description, category) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(name) DO NOTHING',
        [c.name, c.chart_type, c.sql, c.x_column, c.series_columns, c.title, c.y_formatter, c.stack, c.enabled, c.sort_order, c.description, c.category])
    }

    const dashboardDefs = [
      { name: '綜合總覽', description: '一眼看全局', sort_order: 0, analysis: '', actions: '' },
      { name: '時間趨勢分析', description: '各項指標的季度走勢', sort_order: 1, analysis: '', actions: '' },
      { name: '廠區比較分析', description: '各廠區績效對比', sort_order: 2, analysis: '', actions: '' },
      { name: '獲利深度分析', description: '利潤率與報酬率', sort_order: 3, analysis: '', actions: '' },
      { name: '成本與損益', description: '成本結構與損益平衡', sort_order: 4, analysis: '', actions: '' },
    ]
    for (const d of dashboardDefs) { await execute('INSERT INTO dashboard (name, description, sort_order, analysis, actions) VALUES (?, ?, ?, ?, ?) ON CONFLICT(name) DO NOTHING', [d.name, d.description, d.sort_order, d.analysis, d.actions]) }

    const getId = async (table: string, name: string): Promise<number | null> => { const r = await execute(`SELECT id FROM ${table} WHERE name = ?`, [name]); return (r.rows?.[0]?.id as number) ?? null }

    const dashboardContents = [
      { dashboard: '綜合總覽', items: [{ type: 'chart', name: '營收利潤趨勢', span: 2 }, { type: 'chart', name: '廠區營收對比', span: 1 }, { type: 'chart', name: '廠區營收佔比', span: 1 }, { type: 'metric', name: '產品邊際貢獻率', span: 1 }, { type: 'metric', name: '營業利潤率', span: 1 }, { type: 'metric', name: '淨利潤率', span: 1 }, { type: 'metric', name: '庫存周轉天數合計', span: 1 }] },
      { dashboard: '時間趨勢分析', items: [{ type: 'chart', name: '營收利潤趨勢', span: 2 }, { type: 'chart', name: '獲利率趨勢', span: 2 }, { type: 'chart', name: '成本趨勢', span: 2 }, { type: 'chart', name: '庫存周轉天數趨勢', span: 2 }] },
      { dashboard: '廠區比較分析', items: [{ type: 'chart', name: '廠區營收對比', span: 2 }, { type: 'chart', name: '廠區營收佔比', span: 1 }, { type: 'chart', name: '最新一期成本佔比', span: 1 }, { type: 'chart', name: '廠區成本結構', span: 2 }] },
      { dashboard: '獲利深度分析', items: [{ type: 'chart', name: '獲利率趨勢', span: 2 }, { type: 'chart', name: '營收利潤趨勢', span: 2 }, { type: 'metric', name: '產品邊際貢獻率', span: 1 }, { type: 'metric', name: '營業利潤率', span: 1 }, { type: 'metric', name: 'ROE', span: 1 }, { type: 'metric', name: 'ROA', span: 1 }] },
      { dashboard: '成本與損益', items: [{ type: 'chart', name: '成本趨勢', span: 2 }, { type: 'chart', name: '廠區成本結構', span: 2 }, { type: 'chart', name: '最新一期成本佔比', span: 1 }, { type: 'metric', name: '變動成本小計', span: 1 }, { type: 'metric', name: '固定成本小計', span: 1 }, { type: 'metric', name: '產品邊際貢獻率', span: 1 }] },
    ]
    for (const dc of dashboardContents) {
      const dbId = await getId('dashboard', dc.dashboard)
      if (!dbId) continue
      await execute('DELETE FROM dashboard_item WHERE dashboard_id=?', [dbId])
      for (let i = 0; i < dc.items.length; i++) {
        const item = dc.items[i]
        const itemId = await getId(item.type === 'chart' ? 'chart' : 'metric', item.name)
        if (itemId) { await execute('INSERT INTO dashboard_item (dashboard_id, item_type, item_id, col_span, sort_order) VALUES (?,?,?,?,?)', [dbId, item.type, itemId, item.span, i]) }
      }
    }

    const count = factories.length * periods.length
    return { success: true, message: `已產生 ${count} 筆數據、${metrics.length} 個指標、${charts.length} 個圖表、${dashboardDefs.length} 個儀表板` }
  } catch (error) { return { success: false, message: String(error) } }
}

// ---- Exposed window.db API ----
export const webDbApi = {
  async execute(sql: string, params?: unknown[]) {
    try { const result = await execute(sql, params); return { success: true, ...result } }
    catch (error) { return { success: false, message: String(error) } }
  },
  async tables() {
    if (!conn) return { success: false, message: 'Database not ready' }
    try {
      const result = await execute(`SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'main' AND table_type = 'BASE TABLE' AND table_name NOT LIKE '\\_%' ESCAPE '\\' ORDER BY table_name`)
      return { success: true, tables: (result.rows ?? []).map(r => r.name as string) }
    } catch (error) { return { success: false, message: String(error) } }
  },
  async seed() { return seed() },
}

export { execute as rawExecute }
