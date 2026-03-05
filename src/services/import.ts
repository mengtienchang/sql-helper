import * as XLSX from 'xlsx'
import { rawExecute, getDB } from './db'

interface ImportResult {
  success: boolean
  message: string
  rowCount?: number
}

interface PreviewResult {
  success: boolean
  columns: string[]
  rows: Record<string, unknown>[]
  totalRows: number
  message?: string
}

function sanitizeTableName(fileName: string): string {
  return fileName.replace(/\.(csv|xlsx|xls)$/i, '').replace(/[^a-zA-Z0-9_\u4e00-\u9fff]/g, '_')
}

async function previewCSV(file: File): Promise<PreviewResult> {
  try {
    const db = getDB()
    if (!db) return { success: false, columns: [], rows: [], totalRows: 0, message: 'DB not ready' }

    const buffer = new Uint8Array(await file.arrayBuffer())
    await db.registerFileBuffer(file.name, buffer)

    const preview = await rawExecute(`SELECT * FROM read_csv_auto('${file.name}') LIMIT 10`)
    const countResult = await rawExecute(`SELECT COUNT(*) as cnt FROM read_csv_auto('${file.name}')`)
    const totalRows = (countResult.rows?.[0]?.cnt as number) ?? 0

    return { success: true, columns: preview.columns ?? [], rows: preview.rows ?? [], totalRows }
  } catch (err) {
    return { success: false, columns: [], rows: [], totalRows: 0, message: String(err) }
  }
}

async function previewExcel(file: File): Promise<PreviewResult> {
  try {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (!ws) return { success: false, columns: [], rows: [], totalRows: 0, message: '工作表為空' }

    const allRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
    const columns = allRows.length > 0 ? Object.keys(allRows[0]) : []

    return { success: true, columns, rows: allRows.slice(0, 10), totalRows: allRows.length }
  } catch (err) {
    return { success: false, columns: [], rows: [], totalRows: 0, message: String(err) }
  }
}

async function importCSV(file: File, tableName: string, mode: 'create' | 'append'): Promise<ImportResult> {
  try {
    const db = getDB()
    if (!db) return { success: false, message: 'DB not ready' }

    const buffer = new Uint8Array(await file.arrayBuffer())
    await db.registerFileBuffer(file.name, buffer)

    if (mode === 'create') {
      await rawExecute(`DROP TABLE IF EXISTS "${tableName}"`)
      await rawExecute(`CREATE TABLE "${tableName}" AS SELECT * FROM read_csv_auto('${file.name}')`)
    } else {
      await rawExecute(`INSERT INTO "${tableName}" SELECT * FROM read_csv_auto('${file.name}')`)
    }

    const countResult = await rawExecute(`SELECT COUNT(*) as cnt FROM "${tableName}"`)
    const rowCount = (countResult.rows?.[0]?.cnt as number) ?? 0

    return { success: true, message: `匯入完成`, rowCount }
  } catch (err) {
    return { success: false, message: String(err) }
  }
}

async function importExcel(file: File, tableName: string, mode: 'create' | 'append'): Promise<ImportResult> {
  try {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (!ws) return { success: false, message: '工作表為空' }

    const allRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
    if (allRows.length === 0) return { success: false, message: '檔案沒有資料' }

    const columns = Object.keys(allRows[0])

    if (mode === 'create') {
      await rawExecute(`DROP TABLE IF EXISTS "${tableName}"`)
      const colDefs = columns.map(c => {
        const sample = allRows[0][c]
        const type = typeof sample === 'number' ? 'REAL' : 'TEXT'
        return `"${c}" ${type}`
      }).join(', ')
      await rawExecute(`CREATE TABLE "${tableName}" (${colDefs})`)
    }

    // Batch insert
    const batchSize = 100
    for (let i = 0; i < allRows.length; i += batchSize) {
      const batch = allRows.slice(i, i + batchSize)
      const placeholders = batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',')
      const values = batch.flatMap(row => columns.map(c => row[c] ?? null))
      await rawExecute(
        `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(',')}) VALUES ${placeholders}`,
        values,
      )
    }

    return { success: true, message: '匯入完成', rowCount: allRows.length }
  } catch (err) {
    return { success: false, message: String(err) }
  }
}

export const webImportApi = {
  sanitizeTableName,
  async preview(file: File): Promise<PreviewResult> {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'csv') return previewCSV(file)
    return previewExcel(file)
  },
  async execute(file: File, tableName: string, mode: 'create' | 'append'): Promise<ImportResult> {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'csv') return importCSV(file, tableName, mode)
    return importExcel(file, tableName, mode)
  },
}
