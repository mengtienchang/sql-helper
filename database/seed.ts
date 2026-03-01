import { DatabaseService } from './service'
import { join } from 'path'

const DB_PATH = join(__dirname, '../data/financial.db')
const MIGRATIONS_DIR = join(__dirname, 'migrations')

async function seed() {
  const db = new DatabaseService(DB_PATH, MIGRATIONS_DIR)
  await db.init()

  // 廠區
  const factories = [
    { name: '總部', location: '台北' },
    { name: '廠區A', location: '昆山' },
    { name: '廠區B', location: '深圳' },
  ]

  for (const f of factories) {
    db.execute(
      `INSERT OR IGNORE INTO factory (name, location) VALUES (?, ?)`,
      [f.name, f.location]
    )
  }

  // 財報範例數據（每廠區 * 每季度）
  const periods = ['2023-Q1', '2023-Q2', '2023-Q3', '2023-Q4', '2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4']

  const baseData = {
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

  for (let fi = 1; fi <= factories.length; fi++) {
    for (let pi = 0; pi < periods.length; pi++) {
      // 每季成長 ~5%，每廠區用不同倍率
      const factoryScale = [1.0, 0.7, 0.5][fi - 1]
      const quarterGrowth = 1 + pi * 0.05

      const values = columns.map(col => {
        const base = baseData[col as keyof typeof baseData]
        const scaled = base * factoryScale * quarterGrowth
        // 加一點隨機波動 ±3%
        const jitter = 1 + (Math.random() - 0.5) * 0.06
        return Math.round(scaled * jitter * 100) / 100
      })

      db.execute(insertSql, [periods[pi], fi, ...values])
    }
  }

  console.log(`Seeded ${factories.length} factories × ${periods.length} periods = ${factories.length * periods.length} records`)
  db.close()
}

seed().catch(console.error)
