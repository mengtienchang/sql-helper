import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron'
import { join } from 'path'
import { mkdirSync, readFileSync } from 'fs'
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

  if (isDev) {
    const dataDir = join(process.cwd(), 'data')
    mkdirSync(dataDir, { recursive: true })
    dbPath = join(dataDir, 'financial.duckdb')
    migrationsDir = join(__dirname, '../database/migrations')
  } else {
    dbPath = join(app.getPath('userData'), 'financial.duckdb')
    migrationsDir = join(process.resourcesPath, 'database/migrations')
  }

  console.log('[init] dbPath:', dbPath)
  console.log('[init] migrationsDir:', migrationsDir)
  dbService = new DatabaseService(dbPath, migrationsDir)
  await dbService.init()
  console.log('[init] tables:', await dbService.getTables())
}

async function getSchemaForAI(): Promise<string> {
  if (!dbService) return ''
  const tables = await dbService.getTables()
  const schemas: string[] = []
  for (const table of tables) {
    const cols = await dbService.execute(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_name = ? ORDER BY ordinal_position`, [table]
    )
    const colDefs = (cols.rows ?? []).map(c =>
      `  ${c.column_name} ${c.data_type}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}${c.column_default ? ` DEFAULT ${c.column_default}` : ''}`
    ).join(',\n')
    schemas.push(`CREATE TABLE ${table} (\n${colDefs}\n);`)
  }
  return schemas.join('\n\n')
}

function registerIpcHandlers(): void {
  ipcMain.handle('db:execute', async (_event, sql: string, params?: unknown[]) => {
    if (!dbService) {
      return { success: false, message: 'Database not ready' }
    }
    try {
      const result = await dbService.execute(sql, params)
      return { success: true, ...result }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('db:seed', async () => {
    console.log('[main] db:seed called')
    if (!dbService) {
      console.log('[main] db not ready')
      return { success: false, message: 'Database not ready' }
    }
    try {
      await dbService.execute('DELETE FROM dashboard_item')
      await dbService.execute('DELETE FROM dashboard')
      await dbService.execute('DELETE FROM chart')
      await dbService.execute('DELETE FROM metric')
      await dbService.execute('DELETE FROM financial_report')
      await dbService.execute('DELETE FROM factory')

      const factories = [
        { name: '總部', location: '台北' },
        { name: '廠區A', location: '昆山' },
        { name: '廠區B', location: '深圳' },
        { name: '廠區C', location: '東莞' },
        { name: '廠區D', location: '蘇州' },
        { name: '廠區E', location: '重慶' },
        { name: '廠區F', location: '成都' },
        { name: '廠區G', location: '武漢' },
      ]
      const factoryIds: number[] = []
      for (const f of factories) {
        await dbService.execute(
          `INSERT INTO factory (name, location) VALUES (?, ?) ON CONFLICT DO NOTHING`,
          [f.name, f.location]
        )
        const r = await dbService.execute('SELECT id FROM factory WHERE name = ?', [f.name])
        factoryIds.push((r.rows?.[0]?.id as number) ?? 0)
      }

      const periods = ['2023-Q1', '2023-Q2', '2023-Q3', '2023-Q4', '2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4', '2025-Q1', '2025-Q2', '2025-Q3', '2025-Q4']
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

      const factoryScales = [1.0, 0.7, 0.5, 0.6, 0.45, 0.55, 0.4, 0.35]
      for (let fi = 0; fi < factories.length; fi++) {
        for (let pi = 0; pi < periods.length; pi++) {
          const growth = 1 + pi * 0.05
          const values = columns.map(col => {
            const base = baseData[col]
            const scaled = base * factoryScales[fi] * growth
            const jitter = 1 + (Math.random() - 0.5) * 0.06
            return Math.round(scaled * jitter * 100) / 100
          })
          await dbService.execute(insertSql, [periods[pi], factoryIds[fi], ...values])
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
        await dbService.execute(
          `INSERT INTO metric (name, category, sql, description, unit, thresholds) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
          [m.name, m.category, m.sql, m.description, m.unit, m.thresholds]
        )
        if (m.unit || m.thresholds) {
          await dbService.execute(`UPDATE metric SET unit=?, thresholds=? WHERE name=? AND (unit='' OR unit IS NULL)`, [m.unit, m.thresholds, m.name])
        }
      }

      const charts = [
        { name: '各期營收趨勢', chart_type: 'line', sql: `SELECT period, SUM(財報營收) as 營業收入, SUM(營業毛利) as 營業毛利, SUM(淨利潤) as 淨利潤 FROM financial_report GROUP BY period ORDER BY period`, x_column: 'period', series_columns: JSON.stringify(['營業收入', '營業毛利', '淨利潤']), title: '各期營收與利潤趨勢', y_formatter: '{v}萬', stack: 0, enabled: 1, sort_order: 1, description: '營收、毛利、淨利的季度趨勢對比' },
        { name: '廠區成本結構', chart_type: 'stacked_bar', sql: `SELECT f.name as 廠區, SUM(原材料成本) as 原材料, SUM(人工成本) as 人工, SUM(變動製費) as 變動製費, SUM(固定人工) as 固定人工, SUM(廠房設備環境) as 廠房設備 FROM financial_report fr JOIN factory f ON f.id=fr.factory_id GROUP BY f.name`, x_column: '廠區', series_columns: JSON.stringify(['原材料', '人工', '變動製費', '固定人工', '廠房設備']), title: '各廠區成本結構', y_formatter: '{v}萬', stack: 1, enabled: 1, sort_order: 2, description: '各廠區成本組成堆疊比較' },
        { name: '最新一期成本佔比', chart_type: 'pie', sql: `SELECT '原材料' as 類別, SUM(原材料成本) as 金額 FROM financial_report WHERE period=(SELECT MAX(period) FROM financial_report) UNION ALL SELECT '人工', SUM(人工成本) FROM financial_report WHERE period=(SELECT MAX(period) FROM financial_report) UNION ALL SELECT '委外加工', SUM(委外加工) FROM financial_report WHERE period=(SELECT MAX(period) FROM financial_report) UNION ALL SELECT '變動製費', SUM(變動製費) FROM financial_report WHERE period=(SELECT MAX(period) FROM financial_report) UNION ALL SELECT '固定人工', SUM(固定人工) FROM financial_report WHERE period=(SELECT MAX(period) FROM financial_report) UNION ALL SELECT '廠房設備', SUM(廠房設備環境) FROM financial_report WHERE period=(SELECT MAX(period) FROM financial_report)`, x_column: '類別', series_columns: JSON.stringify(['金額']), title: '最新一期成本佔比', y_formatter: '', stack: 0, enabled: 1, sort_order: 3, description: '最新季度各項成本的佔比分析' },
        { name: '獲利率趨勢', chart_type: 'line', sql: `SELECT period, ROUND(SUM(營業毛利)*100.0/SUM(財報營收),2) as 毛利率, ROUND(SUM(營業毛利-銷管研)*100.0/SUM(財報營收),2) as 營業利潤率, ROUND(SUM(淨利潤)*100.0/SUM(財報營收),2) as 淨利潤率 FROM financial_report GROUP BY period ORDER BY period`, x_column: 'period', series_columns: JSON.stringify(['毛利率', '營業利潤率', '淨利潤率']), title: '獲利率趨勢', y_formatter: '{v}%', stack: 0, enabled: 1, sort_order: 4, description: '毛利率、營業利潤率、淨利潤率的季度走勢' },
        { name: '各廠區營收對比', chart_type: 'bar', sql: `SELECT f.name as 廠區, SUM(財報營收) as 營業收入, SUM(淨利潤) as 淨利潤 FROM financial_report fr JOIN factory f ON f.id=fr.factory_id GROUP BY f.name`, x_column: '廠區', series_columns: JSON.stringify(['營業收入', '淨利潤']), title: '各廠區營收對比', y_formatter: '{v}萬', stack: 0, enabled: 1, sort_order: 5, description: '各廠區累計營收與淨利潤比較' },
        { name: '庫存周轉天數趨勢', chart_type: 'stacked_bar', sql: `SELECT period, ROUND(SUM(庫存周轉天數_原材料)/COUNT(*),1) as 原材料, ROUND(SUM(庫存周轉天數_在制品)/COUNT(*),1) as 在制品, ROUND(SUM(庫存周轉天數_成品)/COUNT(*),1) as 成品, ROUND(SUM(庫存周轉天數_模具)/COUNT(*),1) as 模具 FROM financial_report GROUP BY period ORDER BY period`, x_column: 'period', series_columns: JSON.stringify(['原材料', '在制品', '成品', '模具']), title: '庫存周轉天數趨勢', y_formatter: '{v}天', stack: 1, enabled: 1, sort_order: 6, description: '各類庫存周轉天數的季度變化' },
      ]
      for (const c of charts) {
        await dbService.execute(
          `INSERT INTO chart (name, chart_type, sql, x_column, series_columns, title, y_formatter, stack, enabled, sort_order, description) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`,
          [c.name, c.chart_type, c.sql, c.x_column, c.series_columns, c.title, c.y_formatter, c.stack, c.enabled, c.sort_order, c.description]
        )
      }

      const dashboardDefs = [
        { name: '綜合總覽', description: '一眼看全局：營收、成本、獲利、庫存關鍵指標', sort_order: 0, analysis: '從整體趨勢來看，營收與利潤呈現穩定成長態勢，毛利率維持在合理區間。各廠區營收貢獻分佈不均，總部與廠區A為主要營收來源。成本結構中原材料佔比最高，需持續關注原物料價格波動對毛利的影響。庫存周轉天數整體偏高，存在資金佔用風險。', actions: '1. 針對營收貢獻較低的廠區（廠區F、G），評估產能利用率並制定提升計畫\n2. 建立原材料價格預警機制，當價格波動超過 5% 時啟動成本轉嫁或替代方案\n3. 將庫存周轉天數目標設定為降低 10%，各廠區分別制定改善行動方案\n4. 每月追蹤毛利率變化，若連續兩季下降超過 1% 則啟動專案檢討' },
        { name: '獲利分析', description: '利潤率與報酬率深入分析', sort_order: 1, analysis: '整體獲利能力穩健，產品邊際貢獻率維持在 30% 以上水準。營業利潤率受銷管研費用影響，實際值約在 10-12% 區間。ROE 表現良好（8% 以上），顯示股東資金運用效率佳。各廠區中，邊際貢獻與固定成本的比例差異明顯，部分廠區的邊際貢獻剛好覆蓋固定成本，安全邊際不足。', actions: '1. 針對邊際貢獻率低於 28% 的產品線進行檢討，考慮提價或降低變動成本\n2. 安全邊際不足的廠區（邊際貢獻/固定成本 < 1.5），需制定營收提升或成本削減方案\n3. 持續追蹤 ROE 目標 10%，若低於 8% 則啟動資本結構優化\n4. 建立產品獲利分析制度，每季更新各產品線的邊際貢獻排名' },
        { name: '成本分析', description: '各廠區成本結構與損益平衡', sort_order: 2, analysis: '成本結構以原材料為主（約佔 50%），人工成本次之（約佔 19%）。變動成本與固定成本比約為 4:1，顯示成本彈性較大。損益平衡點分析顯示，目前營收已超過損益平衡點約 60-70%，安全邊際充足。但隨著固定成本（特別是廠房設備）逐年增加，損益平衡點也在上升，需要持續關注。', actions: '1. 建立成本監控儀表板，每月追蹤各成本項目的變動趨勢\n2. 原材料成本佔比過高，探索集中採購、長約鎖價等降本策略\n3. 評估自動化投資效益，以固定成本替代部分變動人工成本，長期降低單位成本\n4. 設定安全邊際預警線（實際營收/損益平衡點 < 1.3），觸發時啟動成本削減措施' },
        { name: '營運效率', description: '庫存周轉與產能利用追蹤', sort_order: 3, analysis: '庫存周轉天數整體維持穩定，但模具類庫存周轉天數偏高（85天以上），佔用大量資金。原材料周轉約 45 天、在制品 18 天、成品 22 天，基本處於行業合理水準。各廠區間的庫存管理水平差異不大，但仍有優化空間。', actions: '1. 模具庫存周轉天數過高，需評估閒置模具的處理方案（報廢、轉售或再利用）\n2. 推動 JIT（即時生產）模式，目標將原材料周轉天數降至 35 天\n3. 建立庫存異常預警機制，當單一品類周轉天數超過標準 1.5 倍時自動通知\n4. 每季進行庫存盤點與呆滯分析，呆滯超過 180 天的庫存需提出處理方案' },
        { name: '報酬率追蹤', description: 'ROE/ROA 與利潤走勢', sort_order: 4, analysis: 'ROE 與 ROA 均呈穩步上升趨勢，顯示資本運用效率持續改善。ROE 維持在 7-9% 區間，ROA 約在 3.5-4.5% 區間。獲利率方面，毛利率穩定在 19-21%，但營業利潤率有微幅下降趨勢，銷管研費用增長速度需要關注。', actions: '1. 設定 ROE 年度目標 10%，制定對應的利潤增長與資本效率計畫\n2. 檢討銷管研費用結構，識別可優化項目，目標將費用率控制在 8% 以內\n3. 評估股利政策與再投資比例，在股東回報與成長投資間取得平衡\n4. 每季向董事會報告資本報酬率變化，並與同業 benchmark 比較' },
      ]
      for (const d of dashboardDefs) {
        await dbService.execute(
          `INSERT INTO dashboard (name, description, sort_order, analysis, actions) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
          [d.name, d.description, d.sort_order, d.analysis, d.actions]
        )
      }

      const getId = async (table: string, name: string): Promise<number | null> => {
        const r = await dbService!.execute(`SELECT id FROM ${table} WHERE name = ?`, [name])
        return r.rows?.[0]?.id as number ?? null
      }

      const dashboardContents: { dashboard: string; items: { type: string; name: string; span: number }[] }[] = [
        { dashboard: '綜合總覽', items: [
          { type: 'chart', name: '各期營收趨勢', span: 2 }, { type: 'chart', name: '各廠區營收對比', span: 1 }, { type: 'chart', name: '最新一期成本佔比', span: 1 },
          { type: 'metric', name: '產品邊際貢獻率', span: 1 }, { type: 'metric', name: '營業利潤率', span: 1 }, { type: 'metric', name: '淨利潤率', span: 1 }, { type: 'metric', name: '庫存周轉天數合計', span: 1 },
        ]},
        { dashboard: '獲利分析', items: [
          { type: 'chart', name: '獲利率趨勢', span: 2 }, { type: 'chart', name: '各期營收趨勢', span: 2 },
          { type: 'metric', name: '產品邊際貢獻率', span: 1 }, { type: 'metric', name: '營業利潤率', span: 1 }, { type: 'metric', name: '淨利潤率', span: 1 }, { type: 'metric', name: '產品邊際貢獻', span: 1 }, { type: 'metric', name: 'ROE', span: 1 }, { type: 'metric', name: 'ROA', span: 1 },
        ]},
        { dashboard: '成本分析', items: [
          { type: 'chart', name: '廠區成本結構', span: 2 }, { type: 'chart', name: '最新一期成本佔比', span: 1 }, { type: 'chart', name: '各廠區營收對比', span: 1 },
          { type: 'metric', name: '變動成本小計', span: 1 }, { type: 'metric', name: '固定成本小計', span: 1 }, { type: 'metric', name: '損益平衡營收', span: 1 }, { type: 'metric', name: '產品邊際貢獻率', span: 1 },
        ]},
        { dashboard: '營運效率', items: [
          { type: 'chart', name: '庫存周轉天數趨勢', span: 2 }, { type: 'chart', name: '各廠區營收對比', span: 1 },
          { type: 'metric', name: '庫存周轉天數合計', span: 1 }, { type: 'metric', name: '產品邊際貢獻', span: 1 }, { type: 'metric', name: '損益平衡營收', span: 1 },
        ]},
        { dashboard: '報酬率追蹤', items: [
          { type: 'chart', name: '獲利率趨勢', span: 2 }, { type: 'chart', name: '廠區成本結構', span: 2 },
          { type: 'metric', name: 'ROE', span: 1 }, { type: 'metric', name: 'ROA', span: 1 }, { type: 'metric', name: '營業利潤率', span: 1 }, { type: 'metric', name: '淨利潤率', span: 1 },
        ]},
      ]

      for (const dc of dashboardContents) {
        const dbId = await getId('dashboard', dc.dashboard)
        if (!dbId) continue
        await dbService!.execute('DELETE FROM dashboard_item WHERE dashboard_id=?', [dbId])
        for (let i = 0; i < dc.items.length; i++) {
          const item = dc.items[i]
          const itemId = await getId(item.type === 'chart' ? 'chart' : 'metric', item.name)
          if (itemId) {
            await dbService!.execute(
              `INSERT INTO dashboard_item (dashboard_id, item_type, item_id, col_span, sort_order) VALUES (?,?,?,?,?)`,
              [dbId, item.type, itemId, item.span, i]
            )
          }
        }
      }

      const count = factories.length * periods.length
      console.log(`[main] seed done: ${count} records, ${metrics.length} metrics, ${charts.length} charts, ${dashboardDefs.length} dashboards`)
      return { success: true, message: `已產生 ${count} 筆數據、${metrics.length} 個指標、${charts.length} 個圖表、${dashboardDefs.length} 個儀表板` }
    } catch (error) {
      console.error('[main] seed error:', error)
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('db:tables', async () => {
    if (!dbService) return { success: false, message: 'Database not ready' }
    try {
      const tables = await dbService.getTables()
      return { success: true, tables }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('setting:get', async (_event, key: string) => {
    if (!dbService) return null
    const r = await dbService.execute('SELECT value FROM app_setting WHERE key=?', [key])
    return r.rows?.[0]?.value ?? null
  })

  ipcMain.handle('setting:set', async (_event, key: string, value: string) => {
    if (!dbService) return
    await dbService.execute(
      `INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      [key, value]
    )
  })

  ipcMain.handle('chat:send', async (_event, sessionId: number, userMessage: string) => {
    if (!dbService) return { success: false, message: 'Database not ready' }
    try {
      const keyResult = await dbService.execute('SELECT value FROM app_setting WHERE key=?', ['deepseek_api_key'])
      const apiKey = keyResult.rows?.[0]?.value as string
      if (!apiKey) return { success: false, message: '請先在設定頁填入 DeepSeek API Key' }

      const schema = await getSchemaForAI()

      await dbService.execute('INSERT INTO chat_message (session_id, role, content) VALUES (?, ?, ?)', [sessionId, 'user', userMessage])

      const historyResult = await dbService.execute('SELECT role, content FROM chat_message WHERE session_id=? ORDER BY id DESC LIMIT 20', [sessionId])
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

      if (!response.ok) {
        const errText = await response.text()
        return { success: false, message: `API 錯誤 (${response.status}): ${errText}` }
      }

      const data = await response.json() as any
      const assistantContent = data.choices?.[0]?.message?.content ?? '（無回應）'
      const sqlMatch = assistantContent.match(/```sql\s*([\s\S]*?)```/)
      const sqlText = sqlMatch?.[1]?.trim() ?? null

      let queryResult = null
      if (sqlText) {
        const upper = sqlText.toUpperCase().trim()
        if (upper.startsWith('SELECT') || upper.startsWith('WITH') || upper.startsWith('EXPLAIN')) {
          try { queryResult = await dbService.execute(sqlText) } catch (e) { queryResult = { success: false, message: String(e) } }
        }
      }

      await dbService.execute('INSERT INTO chat_message (session_id, role, content, sql_text) VALUES (?, ?, ?, ?)', [sessionId, 'assistant', assistantContent, sqlText])

      const msgCount = await dbService.execute('SELECT COUNT(*) as cnt FROM chat_message WHERE session_id=? AND role=?', [sessionId, 'user'])
      if ((msgCount.rows?.[0] as any)?.cnt <= 1) {
        const title = userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : '')
        await dbService.execute('UPDATE chat_session SET title=? WHERE id=?', [title, sessionId])
      }

      return { success: true, content: assistantContent, sql: sqlText, queryResult }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('chat:createSession', async () => {
    if (!dbService) return null
    const r = await dbService.execute('INSERT INTO chat_session (title) VALUES (?) RETURNING id', ['新對話'])
    return (r.rows?.[0] as any)?.id ?? null
  })

  ipcMain.handle('chat:getSessions', async () => {
    if (!dbService) return []
    const r = await dbService.execute('SELECT * FROM chat_session ORDER BY created_at DESC')
    return r.rows ?? []
  })

  ipcMain.handle('chat:getMessages', async (_event, sessionId: number) => {
    if (!dbService) return []
    const r = await dbService.execute('SELECT * FROM chat_message WHERE session_id=? ORDER BY id', [sessionId])
    return r.rows ?? []
  })

  ipcMain.handle('chat:deleteSession', async (_event, sessionId: number) => {
    if (!dbService) return
    await dbService.execute('DELETE FROM chat_message WHERE session_id=?', [sessionId])
    await dbService.execute('DELETE FROM chat_session WHERE id=?', [sessionId])
  })

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
      const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: 'export.xlsx', filters: [{ name: 'Excel', extensions: ['xlsx'] }] })
      if (canceled || !filePath) return { success: false, message: '已取消' }
      const ws = XLSX.utils.json_to_sheet(data.rows, { header: data.columns })
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
      XLSX.writeFile(wb, filePath)
      return { success: true, message: filePath }
    } catch (err) { return { success: false, message: String(err) } }
  })

  ipcMain.handle('export:saveTemplate', async (_event, filePath: string, name: string, desc: string) => {
    if (!dbService) return { success: false, message: 'Database not ready' }
    try {
      const buf = readFileSync(filePath)
      const fileName = filePath.split(/[\\/]/).pop() || 'template.xlsx'
      await dbService.execute('INSERT INTO export_template (name, description, file_data, file_name) VALUES (?, ?, ?, ?)', [name, desc, buf as any, fileName])
      return { success: true }
    } catch (err) { return { success: false, message: String(err) } }
  })

  ipcMain.handle('export:getTemplates', async () => {
    if (!dbService) return []
    const r = await dbService.execute('SELECT id, name, description, file_name, created_at FROM export_template ORDER BY id')
    return r.rows ?? []
  })

  ipcMain.handle('export:deleteTemplate', async (_event, id: number) => {
    if (!dbService) return
    await dbService.execute('DELETE FROM export_template WHERE id=?', [id])
  })

  ipcMain.handle('export:scanVars', async (_event, id: number) => {
    if (!dbService) return { success: false, vars: [] }
    try {
      const r = await dbService.execute('SELECT file_data FROM export_template WHERE id=?', [id])
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
    } catch (err) { return { success: false, vars: [], message: String(err) } }
  })

  ipcMain.handle('export:generate', async (_event, id: number, vars: Record<string, string>) => {
    if (!dbService) return { success: false, message: 'Database not ready' }
    try {
      const r = await dbService.execute('SELECT file_data, file_name FROM export_template WHERE id=?', [id])
      if (!r.rows?.length) return { success: false, message: '模板不存在' }
      const tmpl = r.rows[0] as any
      const wb = XLSX.read(tmpl.file_data, { type: 'buffer' })

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName]
        const tableCells: { addr: string; sql: string }[] = []
        for (const cellAddr of Object.keys(ws)) {
          if (cellAddr.startsWith('!')) continue
          const cell = ws[cellAddr]
          if (!cell || cell.t !== 's' || typeof cell.v !== 'string') continue
          let val = cell.v as string
          val = val.replace(/\{\{VAR:([^}]+)\}\}/g, (_, name) => vars[name] ?? '')
          const tableMatch = val.match(/^\{\{TABLE:(.+)\}\}$/)
          if (tableMatch) { tableCells.push({ addr: cellAddr, sql: tableMatch[1] }); continue }
          const sqlMatch = val.match(/^\{\{SQL:(.+)\}\}$/)
          if (sqlMatch) {
            try {
              const result = await dbService!.execute(sqlMatch[1])
              if (result.rows?.length && result.columns?.length) {
                const firstVal = (result.rows[0] as any)[result.columns[0]]
                if (typeof firstVal === 'number') { cell.t = 'n'; cell.v = firstVal } else { cell.t = 's'; cell.v = String(firstVal ?? '') }
              } else { cell.t = 's'; cell.v = '' }
            } catch { cell.t = 's'; cell.v = '#ERROR' }
          } else if (val !== cell.v) { cell.v = val }
        }
        for (const tc of tableCells) {
          try {
            const result = await dbService!.execute(tc.sql)
            if (result.rows?.length && result.columns?.length) {
              const decoded = XLSX.utils.decode_cell(tc.addr)
              const startRow = decoded.r; const startCol = decoded.c
              delete ws[tc.addr]
              result.columns.forEach((col, ci) => { ws[XLSX.utils.encode_cell({ r: startRow, c: startCol + ci })] = { t: 's', v: col } })
              result.rows.forEach((row: any, ri) => {
                result.columns!.forEach((col, ci) => {
                  const addr = XLSX.utils.encode_cell({ r: startRow + 1 + ri, c: startCol + ci })
                  const v = row[col]
                  ws[addr] = typeof v === 'number' ? { t: 'n', v } : { t: 's', v: v == null ? '' : String(v) }
                })
              })
              const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
              range.e.r = Math.max(range.e.r, startRow + result.rows.length)
              range.e.c = Math.max(range.e.c, startCol + result.columns.length - 1)
              ws['!ref'] = XLSX.utils.encode_range(range)
            } else { delete ws[tc.addr] }
          } catch { ws[tc.addr] = { t: 's', v: '#ERROR' } }
        }
      }

      const baseName = tmpl.file_name.replace(/\.xlsx?$/i, '')
      const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: `${baseName}_匯出.xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] })
      if (canceled || !filePath) return { success: false, message: '已取消' }
      XLSX.writeFile(wb, filePath)
      return { success: true, message: filePath }
    } catch (err) { return { success: false, message: String(err) } }
  })

  // ── Import ──
  ipcMain.handle('import:showOpenDialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'CSV / Excel', extensions: ['csv', 'xlsx', 'xls'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths.length) return null
    return filePaths[0]
  })

  ipcMain.handle('import:preview', async (_event, filePath: string) => {
    if (!dbService) return { success: false, columns: [], rows: [], totalRows: 0, message: 'DB not ready' }
    try {
      const ext = filePath.split('.').pop()?.toLowerCase()
      if (ext === 'csv') {
        const escaped = filePath.replace(/\\/g, '/')
        const preview = await dbService.execute(`SELECT * FROM read_csv_auto('${escaped}') LIMIT 10`)
        const countResult = await dbService.execute(`SELECT COUNT(*) as cnt FROM read_csv_auto('${escaped}')`)
        const totalRows = (countResult.rows?.[0]?.cnt as number) ?? 0
        return { success: true, columns: preview.columns ?? [], rows: preview.rows ?? [], totalRows }
      } else {
        const wb = XLSX.readFile(filePath)
        const ws = wb.Sheets[wb.SheetNames[0]]
        if (!ws) return { success: false, columns: [], rows: [], totalRows: 0, message: '工作表為空' }
        const allRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
        const columns = allRows.length > 0 ? Object.keys(allRows[0]) : []
        return { success: true, columns, rows: allRows.slice(0, 10), totalRows: allRows.length }
      }
    } catch (err) {
      return { success: false, columns: [], rows: [], totalRows: 0, message: String(err) }
    }
  })

  ipcMain.handle('import:execute', async (_event, filePath: string, tableName: string, mode: string) => {
    if (!dbService) return { success: false, message: 'DB not ready' }
    try {
      const ext = filePath.split('.').pop()?.toLowerCase()
      if (ext === 'csv') {
        const escaped = filePath.replace(/\\/g, '/')
        if (mode === 'create') {
          await dbService.execute(`DROP TABLE IF EXISTS "${tableName}"`)
          await dbService.execute(`CREATE TABLE "${tableName}" AS SELECT * FROM read_csv_auto('${escaped}')`)
        } else {
          await dbService.execute(`INSERT INTO "${tableName}" SELECT * FROM read_csv_auto('${escaped}')`)
        }
      } else {
        const wb = XLSX.readFile(filePath)
        const ws = wb.Sheets[wb.SheetNames[0]]
        if (!ws) return { success: false, message: '工作表為空' }
        const allRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
        if (allRows.length === 0) return { success: false, message: '檔案沒有資料' }
        const columns = Object.keys(allRows[0])
        if (mode === 'create') {
          await dbService.execute(`DROP TABLE IF EXISTS "${tableName}"`)
          const colDefs = columns.map(c => {
            const sample = allRows[0][c]
            const type = typeof sample === 'number' ? 'REAL' : 'TEXT'
            return `"${c}" ${type}`
          }).join(', ')
          await dbService.execute(`CREATE TABLE "${tableName}" (${colDefs})`)
        }
        const batchSize = 100
        for (let i = 0; i < allRows.length; i += batchSize) {
          const batch = allRows.slice(i, i + batchSize)
          const placeholders = batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',')
          const values = batch.flatMap(row => columns.map(c => row[c] ?? null))
          await dbService.execute(
            `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(',')}) VALUES ${placeholders}`,
            values,
          )
        }
      }
      const countResult = await dbService.execute(`SELECT COUNT(*) as cnt FROM "${tableName}"`)
      const rowCount = (countResult.rows?.[0]?.cnt as number) ?? 0
      return { success: true, message: '匯入完成', rowCount }
    } catch (err) {
      return { success: false, message: String(err) }
    }
  })
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    { label: '檔案', submenu: [{ label: '重新載入', role: 'reload' }, { type: 'separator' }, { label: '結束', role: 'quit' }] },
    { label: '編輯', submenu: [{ label: '復原', role: 'undo' }, { label: '重做', role: 'redo' }, { type: 'separator' }, { label: '剪下', role: 'cut' }, { label: '複製', role: 'copy' }, { label: '貼上', role: 'paste' }, { label: '全選', role: 'selectAll' }] },
    { label: '檢視', submenu: [{ label: '放大', role: 'zoomIn' }, { label: '縮小', role: 'zoomOut' }, { label: '重設縮放', role: 'resetZoom' }, { type: 'separator' }, { label: '全螢幕', role: 'togglefullscreen' }, { type: 'separator' }, { label: '開發者工具', role: 'toggleDevTools' }] },
    { label: '說明', submenu: [
      { label: '使用教程', click: () => { mainWindow?.webContents.send('menu:startTour') } },
      { type: 'separator' },
      { label: 'GitHub 儲存庫', click: () => { shell.openExternal('https://github.com/mengtienchang/sql-helper') } },
      { type: 'separator' },
      { label: '關於 智能財報助手', click: () => {
        dialog.showMessageBox(mainWindow!, {
          type: 'info', title: '關於 智能財報助手', message: '智能財報助手 v0.1.0',
          detail: ['桌面端財務報表分析工具', '', '主要功能：', '  - 儀表板：KPI 卡片 + ECharts 圖表，5 組預設主題', '  - SQL 查詢：直接撰寫 SQL 查詢財報數據', '  - AI 助手：自然語言提問，自動生成 SQL', '  - Excel 匯入/匯出：支援自訂模板佔位符', '  - 指標管理：門檻判斷（良好/注意/異常）', '', '技術架構：', '  Electron + Vue 3 + TypeScript + DuckDB', '', '資料完全離線儲存，無需安裝資料庫。'].join('\n'),
          buttons: ['確定'],
        })
      }},
    ]},
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(async () => {
  buildMenu()
  await initDatabase()
  registerIpcHandlers()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  if (dbService) { dbService.close(); dbService = null }
  if (process.platform !== 'darwin') app.quit()
})
