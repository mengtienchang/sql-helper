import * as XLSX from 'xlsx'
import { rawExecute } from './db'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

// internal: store picked file for saveTemplate
let _pickedFile: File | null = null

export const webExportApi = {
  async showOpenDialog(): Promise<string | null> {
    const file = await pickFile('.xlsx,.xls')
    if (!file) return null
    _pickedFile = file
    return file.name
  },

  async saveTemplate(filePath: string, name: string, desc: string) {
    try {
      const file = _pickedFile
      if (!file) return { success: false, message: '請先選擇檔案' }
      const arrayBuffer = await file.arrayBuffer()
      const uint8 = new Uint8Array(arrayBuffer)
      rawExecute(
        'INSERT INTO export_template (name, description, file_data, file_name) VALUES (?, ?, ?, ?)',
        [name, desc, uint8 as any, file.name],
      )
      _pickedFile = null
      return { success: true }
    } catch (err) {
      return { success: false, message: String(err) }
    }
  },

  async getTemplates() {
    const r = rawExecute('SELECT id, name, description, file_name, created_at FROM export_template ORDER BY id')
    return r.rows ?? []
  },

  async deleteTemplate(id: number) {
    rawExecute('DELETE FROM export_template WHERE id=?', [id])
  },

  async scanVars(id: number) {
    try {
      const r = rawExecute('SELECT file_data FROM export_template WHERE id=?', [id])
      if (!r.rows?.length) return { success: false, vars: [] }
      const buf = (r.rows[0] as any).file_data
      const wb = XLSX.read(buf, { type: 'array' })
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
  },

  async generate(id: number, vars: Record<string, string>) {
    try {
      const r = rawExecute('SELECT file_data, file_name FROM export_template WHERE id=?', [id])
      if (!r.rows?.length) return { success: false, message: '模板不存在' }
      const tmpl = r.rows[0] as any
      const wb = XLSX.read(tmpl.file_data, { type: 'array' })

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
              const result = rawExecute(sqlMatch[1])
              if (result.rows?.length && result.columns?.length) {
                const firstVal = (result.rows[0] as any)[result.columns[0]]
                if (typeof firstVal === 'number') { cell.t = 'n'; cell.v = firstVal }
                else { cell.t = 's'; cell.v = String(firstVal ?? '') }
              } else { cell.t = 's'; cell.v = '' }
            } catch { cell.t = 's'; cell.v = '#ERROR' }
          } else if (val !== cell.v) { cell.v = val }
        }

        for (const tc of tableCells) {
          try {
            const result = rawExecute(tc.sql)
            if (result.rows?.length && result.columns?.length) {
              const decoded = XLSX.utils.decode_cell(tc.addr)
              const startRow = decoded.r
              const startCol = decoded.c
              delete ws[tc.addr]
              result.columns.forEach((col, ci) => {
                const addr = XLSX.utils.encode_cell({ r: startRow, c: startCol + ci })
                ws[addr] = { t: 's', v: col }
              })
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

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const baseName = tmpl.file_name.replace(/\.xlsx?$/i, '')
      downloadBlob(blob, `${baseName}_匯出.xlsx`)
      return { success: true, message: '已下載' }
    } catch (err) {
      return { success: false, message: String(err) }
    }
  },

  async simple(data: { columns: string[]; rows: Record<string, unknown>[] }) {
    try {
      const ws = XLSX.utils.json_to_sheet(data.rows, { header: data.columns })
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      downloadBlob(blob, 'export.xlsx')
      return { success: true, message: '已下載' }
    } catch (err) {
      return { success: false, message: String(err) }
    }
  },
}
