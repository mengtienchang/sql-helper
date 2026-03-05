<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  Table2, RefreshCw, Plus, PlusCircle, Trash2, X, Columns,
  Pencil, Search, ArrowUpDown, ArrowUp, ArrowDown,
  ChevronLeft, ChevronRight, Eye, List, Eraser, Link
} from 'lucide-vue-next'

// ── Types ──
interface ColInfo {
  cid: number; name: string; type: string; notnull: number; dflt_value: any; pk: number
}
interface Row { [key: string]: unknown }
interface FKInfo {
  id: number; seq: number; table: string; from: string; to: string
}
interface FKOption { value: unknown; label: string }
type FKOptionsMap = Record<string, { table: string; column: string; options: FKOption[] }>

interface ColDef {
  name: string; type: string; required: boolean; unique: boolean; defaultVal: string
  fk: boolean; fkTable: string; fkColumn: string
}

const TYPE_OPTIONS = [
  { value: 'TEXT',    label: '文字',   desc: '任意文字、名稱、備註', example: '王小明、備註說明' },
  { value: 'INTEGER', label: '整數',   desc: '數量、年齡、ID 等沒有小數的數字', example: '1, 100, -5' },
  { value: 'REAL',    label: '小數',   desc: '金額、比率等帶小數點的數字', example: '3.14, 99.9' },
  { value: 'NUMERIC', label: '數值',   desc: '通用數值，自動判斷整數或小數', example: '42, 3.14' },
  { value: 'BLOB',    label: '二進位', desc: '檔案、圖片等原始資料（少用）', example: '二進位資料' },
]

function autoDetectType(name: string): string {
  const n = name.trim().toLowerCase()
  if (!n) return 'TEXT'
  if (/^(id|數量|qty|count|amount|num|age|年齡|人數|次數|排序|sort|order|序號|編號)$/i.test(n)) return 'INTEGER'
  if (/((_id|Id|_count|_num|_qty)$)/.test(name.trim())) return 'INTEGER'
  if (/^(is_|has_|flag|enabled|active|啟用|是否)/.test(n)) return 'INTEGER'
  if (/(率|rate|ratio|percent|%|價格|price|cost|金額|salary|薪|weight|重量|溫度|temp)/.test(n)) return 'REAL'
  if (/(amount|total|sum|avg|平均|合計|小計|單價|成本|毛利|淨利|營收|利潤|費用|折舊)/.test(n)) return 'REAL'
  if (/(date|time|日期|時間|created|updated|_at$)/.test(n)) return 'TEXT'
  return 'TEXT'
}

function emptyColDef(): ColDef {
  return { name: '', type: 'TEXT', required: false, unique: false, defaultVal: '', fk: false, fkTable: '', fkColumn: '' }
}

// ── Core State ──
const tables = ref<string[]>([])
const activeTable = ref<string | null>(null)
const columns = ref<ColInfo[]>([])
const rows = ref<Row[]>([])
const rowids = ref<number[]>([])
const loading = ref(false)
const errorMsg = ref('')
const fkInfos = ref<FKInfo[]>([])
const fkOptions = ref<FKOptionsMap>({})

// ── View Mode ──
const viewMode = ref<'data' | 'structure'>('data')

// ── Sort & Search ──
const sortCol = ref<string | null>(null)
const sortDir = ref<'ASC' | 'DESC'>('ASC')
const searchText = ref('')

// ── Pagination ──
const page = ref(1)
const pageSize = 100
const totalRows = ref(0)
const totalPages = computed(() => Math.max(1, Math.ceil(totalRows.value / pageSize)))

// ── Rename ──
const renamingTable = ref<string | null>(null)
const renameInput = ref('')

// ── Create Table ──
const showCreateTable = ref(false)
const newTableName = ref('')
const newTableCols = ref<ColDef[]>([emptyColDef()])
const fkTargetTables = ref<string[]>([])
const fkTargetCols = ref<Record<string, ColInfo[]>>({})

// ── Add Column ──
const showAddCol = ref(false)
const newColName = ref('')
const newColType = ref('TEXT')
const newColDefault = ref('')
const newColUnique = ref(false)
const newColFK = ref(false)
const newColFKTable = ref('')
const newColFKColumn = ref('')

// ── Insert Row ──
const showInsertRow = ref(false)
const insertValues = ref<Record<string, string>>({})

// ── Edit Row ──
const showEditRow = ref(false)
const editRowIndex = ref(-1)
const editValues = ref<Record<string, string>>({})

// ── Confirm Dialogs ──
const showDropTable = ref(false)
const showTruncate = ref(false)
const showDropCol = ref(false)
const dropColName = ref('')

// ══════════════════════════════════════════════
// ── Core Functions ──
// ══════════════════════════════════════════════

async function refreshTables() {
  const result = await window.db.tables()
  if (result.success && result.tables) {
    tables.value = result.tables.filter((t: string) => !t.startsWith('_'))
    if (activeTable.value && !tables.value.includes(activeTable.value)) {
      activeTable.value = null
      columns.value = []
      rows.value = []
      rowids.value = []
    }
  }
}

async function selectTable(name: string) {
  activeTable.value = name
  sortCol.value = null
  searchText.value = ''
  page.value = 1
  viewMode.value = 'data'
  await loadTableData()
}

async function loadTableData() {
  if (!activeTable.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    // Schema
    const schemaResult = await window.db.execute(`PRAGMA table_info('${activeTable.value}')`)
    if (schemaResult.success) columns.value = schemaResult.rows as unknown as ColInfo[]

    // FK info
    const fkResult = await window.db.execute(`PRAGMA foreign_key_list('${activeTable.value}')`)
    if (fkResult.success) fkInfos.value = fkResult.rows as unknown as FKInfo[]
    else fkInfos.value = []

    // Total count
    const countResult = await window.db.execute(`SELECT COUNT(*) as c FROM '${activeTable.value}'${searchWhere()}`)
    if (countResult.success) totalRows.value = (countResult.rows as unknown as Row[])[0]?.c as number ?? 0

    // Clamp page
    if (page.value > totalPages.value) page.value = totalPages.value

    // Data rows
    const offset = (page.value - 1) * pageSize
    let sql = `SELECT rowid as __rowid__, * FROM '${activeTable.value}'${searchWhere()}`
    if (sortCol.value) sql += ` ORDER BY "${sortCol.value}" ${sortDir.value}`
    sql += ` LIMIT ${pageSize} OFFSET ${offset}`

    const dataResult = await window.db.execute(sql)
    if (dataResult.success) {
      const dataRows = dataResult.rows as unknown as Row[]
      rowids.value = dataRows.map(r => r.__rowid__ as number)
      rows.value = dataRows.map(r => {
        const { __rowid__, ...rest } = r
        return rest
      })
    } else {
      errorMsg.value = dataResult.message ?? '載入失敗'
    }

    // Load FK options for insert/edit
    await loadFKOptions()
  } catch (e) {
    errorMsg.value = String(e)
  }
  loading.value = false
}

function searchWhere(): string {
  if (!searchText.value.trim()) return ''
  const textCols = columns.value.filter(c => c.type.toUpperCase().includes('TEXT') || c.type.toUpperCase().includes('CHAR') || c.type === '')
  if (textCols.length === 0) {
    // Search all columns
    const conditions = columns.value.map(c => `CAST("${c.name}" AS TEXT) LIKE '%' || ? || '%'`)
    return ` WHERE (${conditions.join(' OR ')})`
  }
  const conditions = textCols.map(c => `"${c.name}" LIKE '%${searchText.value.trim().replace(/'/g, "''")}%'`)
  return ` WHERE (${conditions.join(' OR ')})`
}

async function loadFKOptions() {
  const opts: FKOptionsMap = {}
  for (const fk of fkInfos.value) {
    const key = fk.from
    if (opts[key]) continue
    try {
      // Find a display column (first TEXT column or the referenced column)
      const colsResult = await window.db.execute(`PRAGMA table_info('${fk.table}')`)
      const refCols = colsResult.success ? colsResult.rows as unknown as ColInfo[] : []
      const textCol = refCols.find(c => !c.pk && (c.type.toUpperCase().includes('TEXT') || c.type.toUpperCase().includes('CHAR')))
      const displayCol = textCol ? textCol.name : fk.to

      const sql = displayCol !== fk.to
        ? `SELECT "${fk.to}" as val, "${displayCol}" as lbl FROM '${fk.table}' ORDER BY "${displayCol}" LIMIT 500`
        : `SELECT "${fk.to}" as val, "${fk.to}" as lbl FROM '${fk.table}' ORDER BY "${fk.to}" LIMIT 500`
      const result = await window.db.execute(sql)
      const options: FKOption[] = result.success
        ? (result.rows as unknown as Row[]).map(r => ({
            value: r.val,
            label: displayCol !== fk.to ? `${r.val} — ${r.lbl}` : String(r.val)
          }))
        : []
      opts[key] = { table: fk.table, column: fk.to, options }
    } catch { /* skip */ }
  }
  fkOptions.value = opts
}

function getFKTag(colName: string): string | null {
  const fk = fkInfos.value.find(f => f.from === colName)
  return fk ? `→ ${fk.table}` : null
}

// ── Sort ──
function toggleSort(colName: string) {
  if (sortCol.value === colName) {
    if (sortDir.value === 'ASC') sortDir.value = 'DESC'
    else { sortCol.value = null; sortDir.value = 'ASC' }
  } else {
    sortCol.value = colName
    sortDir.value = 'ASC'
  }
  page.value = 1
  loadTableData()
}

// ── Search (debounced) ──
let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    loadTableData()
  }, 300)
}

// ── Pagination ──
function prevPage() { if (page.value > 1) { page.value--; loadTableData() } }
function nextPage() { if (page.value < totalPages.value) { page.value++; loadTableData() } }

// ══════════════════════════════════════════════
// ── Create Table ──
// ══════════════════════════════════════════════

async function openCreateTable() {
  newTableName.value = ''
  newTableCols.value = [emptyColDef()]
  showCreateTable.value = true
  await loadFKTargets()
}

async function loadFKTargets() {
  const result = await window.db.tables()
  if (result.success && result.tables) {
    fkTargetTables.value = result.tables.filter((t: string) => !t.startsWith('_'))
  }
}

async function loadFKTargetCols(tableName: string) {
  if (fkTargetCols.value[tableName]) return
  const result = await window.db.execute(`PRAGMA table_info('${tableName}')`)
  if (result.success) {
    fkTargetCols.value[tableName] = result.rows as unknown as ColInfo[]
  }
}

function onColNameBlur(col: ColDef) {
  if (!col.fk) col.type = autoDetectType(col.name)
}

function onFKToggle(col: ColDef) {
  if (col.fk) {
    col.type = 'INTEGER'
    col.fkTable = ''
    col.fkColumn = ''
  } else {
    col.fkTable = ''
    col.fkColumn = ''
    col.type = autoDetectType(col.name)
  }
}

async function onFKTableChange(col: ColDef) {
  col.fkColumn = ''
  if (col.fkTable) {
    await loadFKTargetCols(col.fkTable)
    // Auto-select first PK column
    const cols = fkTargetCols.value[col.fkTable]
    const pk = cols?.find(c => c.pk)
    if (pk) col.fkColumn = pk.name
  }
}

function addColDef() { newTableCols.value.push(emptyColDef()) }
function removeColDef(i: number) { newTableCols.value.splice(i, 1) }

async function createTable() {
  if (!newTableName.value.trim()) { alert('請輸入資料表名稱'); return }
  const validCols = newTableCols.value.filter(c => c.name.trim())
  if (validCols.length === 0) { alert('請至少新增一個欄位'); return }

  const parts: string[] = ['id INTEGER PRIMARY KEY AUTOINCREMENT']
  for (const c of validCols) {
    let def = `"${c.name.trim()}" ${c.type}`
    if (c.required) def += ' NOT NULL'
    if (c.unique) def += ' UNIQUE'
    if (c.defaultVal.trim()) def += ` DEFAULT '${c.defaultVal.trim()}'`
    if (c.fk && c.fkTable && c.fkColumn) def += ` REFERENCES "${c.fkTable}"("${c.fkColumn}")`
    parts.push(def)
  }

  const sql = `CREATE TABLE "${newTableName.value.trim()}" (${parts.join(', ')})`
  const result = await window.db.execute(sql)
  if (result.success) {
    showCreateTable.value = false
    await refreshTables()
    await selectTable(newTableName.value.trim())
  } else {
    alert('建立失敗：' + result.message)
  }
}

// ══════════════════════════════════════════════
// ── Add Column ──
// ══════════════════════════════════════════════

async function openAddCol() {
  newColName.value = ''; newColType.value = 'TEXT'; newColDefault.value = ''
  newColUnique.value = false; newColFK.value = false; newColFKTable.value = ''; newColFKColumn.value = ''
  showAddCol.value = true
  await loadFKTargets()
}

function onAddColNameBlur() {
  if (!newColFK.value) newColType.value = autoDetectType(newColName.value)
}

function onAddColFKToggle() {
  if (newColFK.value) { newColType.value = 'INTEGER'; newColFKTable.value = ''; newColFKColumn.value = '' }
  else { newColFKTable.value = ''; newColFKColumn.value = ''; newColType.value = autoDetectType(newColName.value) }
}

async function onAddColFKTableChange() {
  newColFKColumn.value = ''
  if (newColFKTable.value) {
    await loadFKTargetCols(newColFKTable.value)
    const cols = fkTargetCols.value[newColFKTable.value]
    const pk = cols?.find(c => c.pk)
    if (pk) newColFKColumn.value = pk.name
  }
}

async function addColumn() {
  if (!newColName.value.trim()) { alert('請輸入欄位名稱'); return }
  let sql = `ALTER TABLE "${activeTable.value}" ADD COLUMN "${newColName.value.trim()}" ${newColType.value}`
  if (newColDefault.value.trim()) sql += ` DEFAULT '${newColDefault.value.trim()}'`
  if (newColFK.value && newColFKTable.value && newColFKColumn.value) {
    sql += ` REFERENCES "${newColFKTable.value}"("${newColFKColumn.value}")`
  }
  const result = await window.db.execute(sql)
  if (result.success) {
    showAddCol.value = false
    await loadTableData()
  } else {
    alert('新增欄位失敗：' + result.message)
  }
}

// ══════════════════════════════════════════════
// ── Insert Row ──
// ══════════════════════════════════════════════

function openInsertRow() {
  insertValues.value = {}
  for (const col of columns.value) {
    if (col.pk) continue
    insertValues.value[col.name] = ''
  }
  showInsertRow.value = true
}

async function insertRow() {
  const nonPkCols = columns.value.filter(c => !c.pk)
  const colNames = nonPkCols.map(c => `"${c.name}"`).join(', ')
  const placeholders = nonPkCols.map(() => '?').join(', ')
  const values = nonPkCols.map(c => insertValues.value[c.name] || null)
  const sql = `INSERT INTO "${activeTable.value}" (${colNames}) VALUES (${placeholders})`
  const result = await window.db.execute(sql, values)
  if (result.success) {
    showInsertRow.value = false
    await loadTableData()
  } else {
    alert('新增失敗：' + result.message)
  }
}

// ══════════════════════════════════════════════
// ── Edit Row ──
// ══════════════════════════════════════════════

function openEditRow(i: number) {
  editRowIndex.value = i
  editValues.value = {}
  for (const col of columns.value) {
    editValues.value[col.name] = rows.value[i][col.name] != null ? String(rows.value[i][col.name]) : ''
  }
  showEditRow.value = true
}

async function saveEditRow() {
  const nonPkCols = columns.value.filter(c => !c.pk)
  const setParts = nonPkCols.map(c => `"${c.name}" = ?`).join(', ')
  const values = nonPkCols.map(c => editValues.value[c.name] || null)
  const rowid = rowids.value[editRowIndex.value]
  const sql = `UPDATE "${activeTable.value}" SET ${setParts} WHERE rowid = ?`
  const result = await window.db.execute(sql, [...values, rowid])
  if (result.success) {
    showEditRow.value = false
    await loadTableData()
  } else {
    alert('更新失敗：' + result.message)
  }
}

// ══════════════════════════════════════════════
// ── Delete Row ──
// ══════════════════════════════════════════════

async function deleteRow(i: number) {
  if (!confirm('確定要刪除這筆資料？')) return
  const rowid = rowids.value[i]
  const result = await window.db.execute(`DELETE FROM "${activeTable.value}" WHERE rowid = ?`, [rowid])
  if (result.success) await loadTableData()
  else alert('刪除失敗：' + result.message)
}

// ══════════════════════════════════════════════
// ── Drop Table ──
// ══════════════════════════════════════════════

async function dropTable() {
  const result = await window.db.execute(`DROP TABLE "${activeTable.value}"`)
  if (result.success) {
    showDropTable.value = false
    activeTable.value = null; columns.value = []; rows.value = []; rowids.value = []
    await refreshTables()
  } else {
    alert('刪除資料表失敗：' + result.message)
  }
}

// ══════════════════════════════════════════════
// ── Truncate ──
// ══════════════════════════════════════════════

async function truncateTable() {
  const result = await window.db.execute(`DELETE FROM "${activeTable.value}"`)
  if (result.success) {
    showTruncate.value = false
    await loadTableData()
  } else {
    alert('清空失敗：' + result.message)
  }
}

// ══════════════════════════════════════════════
// ── Rename Table ──
// ══════════════════════════════════════════════

function startRename(name: string) {
  renamingTable.value = name
  renameInput.value = name
}

async function finishRename() {
  const oldName = renamingTable.value
  const newName = renameInput.value.trim()
  renamingTable.value = null
  if (!oldName || !newName || oldName === newName) return
  const result = await window.db.execute(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`)
  if (result.success) {
    if (activeTable.value === oldName) activeTable.value = newName
    await refreshTables()
    if (activeTable.value === newName) await loadTableData()
  } else {
    alert('重命名失敗：' + result.message)
  }
}

// ══════════════════════════════════════════════
// ── Delete Column ──
// ══════════════════════════════════════════════

function confirmDropCol(colName: string) {
  dropColName.value = colName
  showDropCol.value = true
}

async function dropColumn() {
  const sql = `ALTER TABLE "${activeTable.value}" DROP COLUMN "${dropColName.value}"`
  const result = await window.db.execute(sql)
  if (result.success) {
    showDropCol.value = false
    await loadTableData()
  } else {
    alert('刪除欄位失敗：' + result.message)
  }
}

// ── Init ──
refreshTables()
</script>

<template>
  <div class="tables-view">
    <!-- Page Header -->
    <div class="page-header">
      <div>
        <h2>資料表</h2>
        <p class="subtitle">瀏覽與管理資料庫中的表格</p>
      </div>
      <div class="header-actions">
        <button class="btn-secondary" @click="refreshTables">
          <RefreshCw :size="14" />
          <span>重新整理</span>
        </button>
        <button class="btn-primary" @click="openCreateTable">
          <Plus :size="14" />
          <span>建立資料表</span>
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="tables.length === 0" class="empty-state">
      <Table2 :size="48" stroke-width="1" />
      <p>目前沒有資料表，請先匯入資料或建立新資料表</p>
      <button class="btn-primary" style="margin-top: 8px" @click="openCreateTable">
        <Plus :size="14" />
        建立第一個資料表
      </button>
    </div>

    <!-- Tables Content -->
    <div v-else class="tables-content">
      <!-- Tab Bar -->
      <div class="table-tabs">
        <template v-for="t in tables" :key="t">
          <div v-if="renamingTable === t" class="tab-rename-wrap">
            <input
              v-model="renameInput"
              class="tab-rename-input"
              @blur="finishRename"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
              @keydown.escape="renamingTable = null"
              ref="renameInputEl"
              autofocus
            />
          </div>
          <button
            v-else
            :class="['tab', { active: activeTable === t }]"
            @click="selectTable(t)"
            @dblclick.prevent="startRename(t)"
            :title="`雙擊重新命名`"
          >
            <Table2 :size="14" />
            {{ t }}
          </button>
        </template>
      </div>

      <!-- Selected table content -->
      <div v-if="activeTable" class="table-body">
        <!-- Toolbar -->
        <div class="table-toolbar">
          <div class="toolbar-left">
            <span class="row-count">{{ totalRows }} 筆資料・{{ columns.length }} 個欄位</span>
            <!-- View toggle -->
            <div class="view-toggle">
              <button :class="['vt-btn', { active: viewMode === 'data' }]" @click="viewMode = 'data'" title="資料檢視：查看表裡的實際資料">
                <List :size="13" />
              </button>
              <button :class="['vt-btn', { active: viewMode === 'structure' }]" @click="viewMode = 'structure'" title="結構檢視：查看欄位設定（類型、約束、外鍵等）">
                <Eye :size="13" />
              </button>
            </div>
          </div>
          <div class="toolbar-actions">
            <!-- Search (data mode only) -->
            <div v-if="viewMode === 'data'" class="search-box">
              <Search :size="13" class="search-icon" />
              <input
                v-model="searchText"
                class="search-input"
                placeholder="搜尋..."
                @input="onSearchInput"
              />
            </div>
            <button class="btn-secondary sm" @click="openAddCol" title="在這張表新增一個直欄（欄位）">
              <Columns :size="13" />
              新增欄位
            </button>
            <button class="btn-secondary sm" @click="openInsertRow" title="新增一筆（橫列）資料">
              <PlusCircle :size="13" />
              新增資料
            </button>
            <button class="btn-secondary sm btn-warn" @click="showTruncate = true" title="刪除表中所有資料，但保留表的結構">
              <Eraser :size="13" />
              清空
            </button>
            <button class="btn-danger sm" @click="showDropTable = true" title="整張表連同所有資料一起刪除，無法復原">
              <Trash2 :size="13" />
              刪除表
            </button>
          </div>
        </div>

        <!-- Error -->
        <div v-if="errorMsg" class="error-bar">{{ errorMsg }}</div>

        <!-- Loading -->
        <div v-if="loading" class="loading-bar">載入中...</div>

        <!-- ── Data View ── -->
        <template v-else-if="viewMode === 'data'">
          <div class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th
                    v-for="col in columns"
                    :key="col.name"
                    class="sortable-th"
                    @click="toggleSort(col.name)"
                  >
                    <div class="th-content">
                      <div>
                        <span class="col-name">{{ col.name }}</span>
                        <span class="col-type">
                          {{ col.type }}
                          <span v-if="getFKTag(col.name)" class="fk-tag">{{ getFKTag(col.name) }}</span>
                        </span>
                      </div>
                      <span class="sort-icon">
                        <ArrowUp v-if="sortCol === col.name && sortDir === 'ASC'" :size="12" />
                        <ArrowDown v-else-if="sortCol === col.name && sortDir === 'DESC'" :size="12" />
                        <ArrowUpDown v-else :size="12" class="sort-idle" />
                      </span>
                    </div>
                  </th>
                  <th class="action-col">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="rows.length === 0">
                  <td :colspan="columns.length + 1" class="empty-rows">
                    {{ searchText ? '找不到符合的資料' : '尚無資料，點擊「新增資料」來新增' }}
                  </td>
                </tr>
                <tr v-for="(row, i) in rows" :key="i">
                  <td v-for="col in columns" :key="col.name" class="cell">
                    {{ row[col.name] ?? '' }}
                  </td>
                  <td class="action-col">
                    <div class="row-actions">
                      <button class="edit-row-btn" @click="openEditRow(i)" title="編輯">
                        <Pencil :size="12" />
                      </button>
                      <button class="delete-row-btn" @click="deleteRow(i)" title="刪除">
                        <Trash2 :size="12" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div v-if="totalPages > 1" class="pagination">
            <button class="page-btn" :disabled="page <= 1" @click="prevPage">
              <ChevronLeft :size="14" />
            </button>
            <span class="page-info">第 {{ page }} / {{ totalPages }} 頁</span>
            <button class="page-btn" :disabled="page >= totalPages" @click="nextPage">
              <ChevronRight :size="14" />
            </button>
          </div>
        </template>

        <!-- ── Structure View ── -->
        <div v-else class="structure-view">
          <p class="help-text" style="margin-bottom: 12px">
            這裡顯示資料表的「結構」— 有哪些欄位、各欄位的設定。你可以在這裡刪除不需要的欄位。
          </p>
          <div class="struct-legend">
            <span class="badge pk" title="主鍵：每筆資料的唯一識別碼，系統自動產生，不會重複">PK 主鍵</span>
            <span class="badge nn" title="必填：新增資料時此欄位不可留空">NOT NULL 必填</span>
            <span class="badge fk" title="外鍵：此欄位的值必須來自另一張表"><Link :size="11" /> FK 外鍵</span>
          </div>
          <table class="struct-table">
            <thead>
              <tr>
                <th>欄位名稱</th>
                <th>類型</th>
                <th>主鍵</th>
                <th>必填</th>
                <th>預設值</th>
                <th>外鍵</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="col in columns" :key="col.cid">
                <td class="struct-name">{{ col.name }}</td>
                <td><span class="type-badge">{{ col.type || 'ANY' }}</span></td>
                <td><span v-if="col.pk" class="badge pk" title="主鍵：此欄位是每筆資料的唯一識別碼">PK</span></td>
                <td><span v-if="col.notnull" class="badge nn" title="必填：此欄位不可留空">NOT NULL</span></td>
                <td class="struct-default">{{ col.dflt_value ?? '' }}</td>
                <td>
                  <span v-if="getFKTag(col.name)" class="badge fk" :title="`外鍵：此欄位的值必須存在於 ${getFKTag(col.name)?.replace('→ ', '')} 表中`">
                    <Link :size="11" />
                    {{ getFKTag(col.name) }}
                  </span>
                </td>
                <td class="struct-action">
                  <button
                    v-if="!col.pk"
                    class="delete-row-btn"
                    @click="confirmDropCol(col.name)"
                    title="刪除此欄位（該欄位的所有資料也會一併刪除）"
                  >
                    <Trash2 :size="12" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else class="select-hint">
        <Table2 :size="32" stroke-width="1" />
        <p>請選擇資料表以查看內容</p>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════ -->
    <!-- ── Modals ── -->
    <!-- ══════════════════════════════════════════════ -->

    <!-- Create Table -->
    <div v-if="showCreateTable" class="modal-overlay" @click.self="showCreateTable = false">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h3>建立資料表</h3>
          <button class="close-btn" @click="showCreateTable = false"><X :size="18" /></button>
        </div>
        <div class="modal-body">
          <label class="field-label">資料表名稱</label>
          <input v-model="newTableName" class="field-input" placeholder="例如：products" />

          <div class="field-label" style="margin-top: 16px;">
            欄位定義
            <small style="color: #9ca3af; font-weight: 400;">（id 主鍵自動加入）</small>
          </div>
          <p class="help-text">每個欄位就是表格裡的一個「直欄」。例如員工表可能有「姓名」「年齡」「部門」等欄位。</p>

          <div class="col-defs">
            <div v-for="(col, i) in newTableCols" :key="i" class="col-def-item">
              <div class="col-def-row">
                <input v-model="col.name" class="field-input col-name-input" placeholder="欄位名稱" @blur="onColNameBlur(col)" />
                <select v-model="col.type" class="field-select type-select" :disabled="col.fk">
                  <option v-for="t in TYPE_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}（{{ t.value }}）</option>
                </select>
                <label class="checkbox-label" title="勾選後此欄位不可留空，每筆資料都必須填寫"><input type="checkbox" v-model="col.required" /> 必填</label>
                <label class="checkbox-label" title="勾選後此欄位的值不可重複，例如身分證號、帳號等"><input type="checkbox" v-model="col.unique" /> 唯一</label>
                <button class="icon-btn" @click="removeColDef(i)" :disabled="newTableCols.length === 1"><X :size="14" /></button>
              </div>
              <!-- Extra options row -->
              <div class="col-extra-row">
                <div class="col-type-hint">
                  {{ TYPE_OPTIONS.find(t => t.value === col.type)?.desc }} — 如：{{ TYPE_OPTIONS.find(t => t.value === col.type)?.example }}
                </div>
                <input v-model="col.defaultVal" class="field-input default-input" placeholder="預設值" title="新增資料時若未填寫此欄位，會自動填入這個值" />
                <label class="checkbox-label fk-toggle" title="外鍵：讓此欄位的值必須來自另一張表，用來建立表與表之間的關聯。例如「訂單」的「客戶ID」指向「客戶」表">
                  <input type="checkbox" v-model="col.fk" @change="onFKToggle(col)" />
                  <Link :size="12" />
                  外鍵
                </label>
              </div>
              <!-- FK selectors -->
              <div v-if="col.fk" class="fk-hint">
                <span>選擇這個欄位要參照哪張表的哪個欄位。填入資料時，只能填那張表裡已存在的值。</span>
              </div>
              <div v-if="col.fk" class="fk-row">
                <select v-model="col.fkTable" class="field-select fk-select" @change="onFKTableChange(col)">
                  <option value="">選擇參照表…</option>
                  <option v-for="t in fkTargetTables" :key="t" :value="t">{{ t }}</option>
                </select>
                <select v-model="col.fkColumn" class="field-select fk-select" :disabled="!col.fkTable">
                  <option value="">選擇欄位…</option>
                  <option v-for="c in (fkTargetCols[col.fkTable] || [])" :key="c.name" :value="c.name">
                    {{ c.name }}（{{ c.type }}）{{ c.pk ? ' PK' : '' }}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <button class="add-col-btn" @click="addColDef">
            <Plus :size="13" />
            新增欄位
          </button>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="showCreateTable = false">取消</button>
          <button class="btn-primary" @click="createTable">建立</button>
        </div>
      </div>
    </div>

    <!-- Add Column -->
    <div v-if="showAddCol" class="modal-overlay" @click.self="showAddCol = false">
      <div class="modal" style="max-width: 460px">
        <div class="modal-header">
          <h3>新增欄位 — {{ activeTable }}</h3>
          <button class="close-btn" @click="showAddCol = false"><X :size="18" /></button>
        </div>
        <div class="modal-body">
          <label class="field-label">欄位名稱</label>
          <input v-model="newColName" class="field-input" placeholder="例如：description" @blur="onAddColNameBlur" />
          <label class="field-label" style="margin-top: 12px">欄位類型</label>
          <select v-model="newColType" class="field-select" style="width: 100%" :disabled="newColFK">
            <option v-for="t in TYPE_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}（{{ t.value }}）— {{ t.desc }}</option>
          </select>
          <div class="col-type-hint" style="margin-top: 4px">
            {{ TYPE_OPTIONS.find(t => t.value === newColType)?.desc }} — 如：{{ TYPE_OPTIONS.find(t => t.value === newColType)?.example }}
          </div>
          <label class="field-label" style="margin-top: 12px">預設值（選填）</label>
          <input v-model="newColDefault" class="field-input" placeholder="留空表示 NULL" />
          <p class="help-text">如果新增資料時沒有填這個欄位，就會自動用這個值。</p>

          <!-- FK -->
          <div style="margin-top: 14px; border-top: 1px solid #e5e7eb; padding-top: 14px">
            <label class="checkbox-label" style="font-size: 13px; font-weight: 600; color: #374151; gap: 6px; margin-bottom: 4px">
              <input type="checkbox" v-model="newColFK" @change="onAddColFKToggle" />
              <Link :size="13" />
              設為外鍵
            </label>
            <p class="help-text" style="margin-bottom: 10px">外鍵可以讓這個欄位的值必須來自另一張表，用來建立表與表之間的關聯。例如「訂單」表的「客戶ID」可以指向「客戶」表的 ID。</p>
            <div v-if="newColFK" style="display: flex; gap: 8px">
              <select v-model="newColFKTable" class="field-select" style="flex:1" @change="onAddColFKTableChange">
                <option value="">選擇參照表…</option>
                <option v-for="t in fkTargetTables" :key="t" :value="t">{{ t }}</option>
              </select>
              <select v-model="newColFKColumn" class="field-select" style="flex:1" :disabled="!newColFKTable">
                <option value="">選擇欄位…</option>
                <option v-for="c in (fkTargetCols[newColFKTable] || [])" :key="c.name" :value="c.name">
                  {{ c.name }}（{{ c.type }}）{{ c.pk ? ' PK' : '' }}
                </option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="showAddCol = false">取消</button>
          <button class="btn-primary" @click="addColumn">新增欄位</button>
        </div>
      </div>
    </div>

    <!-- Insert Row -->
    <div v-if="showInsertRow" class="modal-overlay" @click.self="showInsertRow = false">
      <div class="modal">
        <div class="modal-header">
          <h3>新增資料 — {{ activeTable }}</h3>
          <button class="close-btn" @click="showInsertRow = false"><X :size="18" /></button>
        </div>
        <div class="modal-body">
          <div v-for="col in columns.filter(c => !c.pk)" :key="col.name" style="margin-bottom: 12px">
            <label class="field-label">
              {{ col.name }}
              <small style="color: #9ca3af; font-weight: 400;">{{ col.type }}</small>
              <small v-if="getFKTag(col.name)" style="color: #2563eb; font-weight: 400;">{{ getFKTag(col.name) }}</small>
            </label>
            <!-- FK: dropdown -->
            <select
              v-if="fkOptions[col.name]"
              v-model="insertValues[col.name]"
              class="field-select"
              style="width: 100%"
            >
              <option value="">（留空）</option>
              <option v-for="opt in fkOptions[col.name].options" :key="String(opt.value)" :value="String(opt.value)">
                {{ opt.label }}
              </option>
            </select>
            <!-- Normal: text input -->
            <input
              v-else
              v-model="insertValues[col.name]"
              class="field-input"
              :placeholder="col.dflt_value != null ? `預設：${col.dflt_value}` : ''"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="showInsertRow = false">取消</button>
          <button class="btn-primary" @click="insertRow">新增</button>
        </div>
      </div>
    </div>

    <!-- Edit Row -->
    <div v-if="showEditRow" class="modal-overlay" @click.self="showEditRow = false">
      <div class="modal">
        <div class="modal-header">
          <h3>編輯資料 — {{ activeTable }}</h3>
          <button class="close-btn" @click="showEditRow = false"><X :size="18" /></button>
        </div>
        <div class="modal-body">
          <div v-for="col in columns" :key="col.name" style="margin-bottom: 12px">
            <label class="field-label">
              {{ col.name }}
              <small style="color: #9ca3af; font-weight: 400;">{{ col.type }}</small>
              <small v-if="col.pk" style="color: #f59e0b; font-weight: 500;">主鍵（唯讀）</small>
              <small v-if="getFKTag(col.name)" style="color: #2563eb; font-weight: 400;">{{ getFKTag(col.name) }}</small>
            </label>
            <!-- PK: readonly -->
            <input v-if="col.pk" :value="editValues[col.name]" class="field-input" disabled style="background: #f3f4f6; color: #9ca3af" />
            <!-- FK: dropdown -->
            <select
              v-else-if="fkOptions[col.name]"
              v-model="editValues[col.name]"
              class="field-select"
              style="width: 100%"
            >
              <option value="">（留空）</option>
              <option v-for="opt in fkOptions[col.name].options" :key="String(opt.value)" :value="String(opt.value)">
                {{ opt.label }}
              </option>
            </select>
            <!-- Normal -->
            <input v-else v-model="editValues[col.name]" class="field-input" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="showEditRow = false">取消</button>
          <button class="btn-primary" @click="saveEditRow">儲存</button>
        </div>
      </div>
    </div>

    <!-- Drop Table -->
    <div v-if="showDropTable" class="modal-overlay" @click.self="showDropTable = false">
      <div class="modal" style="max-width: 400px">
        <div class="modal-header">
          <h3>刪除資料表</h3>
          <button class="close-btn" @click="showDropTable = false"><X :size="18" /></button>
        </div>
        <div class="modal-body">
          <p style="color: #374151; line-height: 1.6;">
            確定要刪除資料表 <strong>{{ activeTable }}</strong> 嗎？<br />
            此操作無法復原，所有資料將永久刪除。
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="showDropTable = false">取消</button>
          <button class="btn-danger" @click="dropTable">確定刪除</button>
        </div>
      </div>
    </div>

    <!-- Truncate -->
    <div v-if="showTruncate" class="modal-overlay" @click.self="showTruncate = false">
      <div class="modal" style="max-width: 400px">
        <div class="modal-header">
          <h3>清空資料表</h3>
          <button class="close-btn" @click="showTruncate = false"><X :size="18" /></button>
        </div>
        <div class="modal-body">
          <p style="color: #374151; line-height: 1.6;">
            確定要清空 <strong>{{ activeTable }}</strong> 的所有資料嗎？<br />
            表結構會保留，但所有 {{ totalRows }} 筆資料將被刪除。
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="showTruncate = false">取消</button>
          <button class="btn-danger" @click="truncateTable">確定清空</button>
        </div>
      </div>
    </div>

    <!-- Drop Column -->
    <div v-if="showDropCol" class="modal-overlay" @click.self="showDropCol = false">
      <div class="modal" style="max-width: 400px">
        <div class="modal-header">
          <h3>刪除欄位</h3>
          <button class="close-btn" @click="showDropCol = false"><X :size="18" /></button>
        </div>
        <div class="modal-body">
          <p style="color: #374151; line-height: 1.6;">
            確定要從 <strong>{{ activeTable }}</strong> 刪除欄位 <strong>{{ dropColName }}</strong> 嗎？<br />
            該欄位的所有資料將永久刪除。
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="showDropCol = false">取消</button>
          <button class="btn-danger" @click="dropColumn">確定刪除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Layout ── */
.tables-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

.page-header {
  display: flex; align-items: flex-start; justify-content: space-between; padding: 24px 28px 16px;
}
.page-header h2 { font-size: 22px; font-weight: 700; color: #111827; margin: 0; }
.subtitle { font-size: 14px; color: #6b7280; margin-top: 4px; }
.header-actions { display: flex; gap: 8px; align-items: center; }

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; height: 300px; color: #9ca3af; gap: 12px;
}
.empty-state p { font-size: 14px; }

.tables-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

/* ── Tabs ── */
.table-tabs {
  display: flex; gap: 4px; padding: 0 28px;
  border-bottom: 1px solid #e5e7eb; overflow-x: auto; flex-shrink: 0;
}
.tab {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; border: none;
  border-bottom: 2px solid transparent;
  background: transparent; color: #6b7280;
  cursor: pointer; font-size: 13px; white-space: nowrap; transition: all 0.15s;
}
.tab:hover { color: #374151; }
.tab.active { color: #2563eb; border-bottom-color: #2563eb; font-weight: 500; }

.tab-rename-wrap { display: flex; align-items: center; padding: 4px 0; }
.tab-rename-input {
  padding: 4px 10px; font-size: 13px; border: 1px solid #2563eb;
  border-radius: 4px; outline: none; width: 120px;
}

/* ── Table body ── */
.table-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

.table-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 28px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0;
  background: #f9fafb; gap: 12px; flex-wrap: wrap;
}
.toolbar-left { display: flex; align-items: center; gap: 12px; }
.row-count { font-size: 13px; color: #6b7280; white-space: nowrap; }
.toolbar-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }

.view-toggle {
  display: flex; border: 1px solid #d1d5db; border-radius: 6px; overflow: hidden;
}
.vt-btn {
  padding: 4px 8px; border: none; background: #fff; color: #9ca3af;
  cursor: pointer; display: flex; align-items: center; transition: all 0.15s;
}
.vt-btn:not(:last-child) { border-right: 1px solid #d1d5db; }
.vt-btn.active { background: #2563eb; color: #fff; }
.vt-btn:hover:not(.active) { background: #f3f4f6; }

.search-box {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff;
}
.search-icon { color: #9ca3af; flex-shrink: 0; }
.search-input {
  border: none; outline: none; font-size: 12px; width: 120px; color: #111827; background: transparent;
}

.error-bar { padding: 8px 28px; background: #fef2f2; color: #dc2626; font-size: 13px; flex-shrink: 0; }
.loading-bar { padding: 20px 28px; color: #6b7280; font-size: 13px; }

/* ── Data Table ── */
.data-table-wrap { flex: 1; overflow: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table thead th {
  position: sticky; top: 0; z-index: 1;
  background: #f3f4f6; padding: 8px 12px;
  text-align: left; border-bottom: 1px solid #e5e7eb;
  white-space: nowrap; font-weight: 600; color: #374151;
}
.sortable-th { cursor: pointer; user-select: none; }
.sortable-th:hover { background: #e5e7eb; }
.th-content { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.sort-icon { display: flex; align-items: center; color: #374151; }
.sort-idle { opacity: 0.3; }

.col-name { display: block; }
.col-type { display: block; font-size: 11px; font-weight: 400; color: #9ca3af; }
.fk-tag { color: #2563eb; margin-left: 4px; }

.data-table tbody tr:hover { background: #f9fafb; }
.data-table tbody tr:nth-child(even) { background: #fafafa; }
.data-table tbody tr:nth-child(even):hover { background: #f3f4f6; }
.cell {
  padding: 7px 12px; border-bottom: 1px solid #f3f4f6;
  color: #374151; max-width: 300px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.action-col { width: 70px; padding: 4px 8px; text-align: center; }
.row-actions { display: flex; gap: 2px; justify-content: center; }
.edit-row-btn, .delete-row-btn {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border: none; border-radius: 5px;
  background: transparent; color: #9ca3af; cursor: pointer; transition: all 0.15s;
}
.edit-row-btn:hover { background: #dbeafe; color: #2563eb; }
.delete-row-btn:hover { background: #fee2e2; color: #dc2626; }

.empty-rows { text-align: center; padding: 40px; color: #9ca3af; font-size: 13px; }

/* ── Pagination ── */
.pagination {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  padding: 10px 28px; border-top: 1px solid #e5e7eb; flex-shrink: 0; background: #f9fafb;
}
.page-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border: 1px solid #d1d5db; border-radius: 6px;
  background: #fff; color: #374151; cursor: pointer; transition: all 0.15s;
}
.page-btn:hover:not(:disabled) { background: #f3f4f6; }
.page-btn:disabled { opacity: 0.4; cursor: default; }
.page-info { font-size: 13px; color: #6b7280; }

/* ── Help text ── */
.help-text {
  font-size: 12px; color: #9ca3af; margin: 4px 0 0; line-height: 1.5;
}
.fk-hint {
  font-size: 11px; color: #6b7280; padding-left: 2px; font-style: italic;
}
.struct-legend {
  display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;
}

/* ── Structure View ── */
.structure-view { flex: 1; overflow: auto; padding: 16px 28px; }
.struct-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.struct-table thead th {
  text-align: left; padding: 8px 12px; border-bottom: 2px solid #e5e7eb;
  font-weight: 600; color: #374151; font-size: 12px;
}
.struct-table tbody td {
  padding: 8px 12px; border-bottom: 1px solid #f3f4f6; color: #374151;
}
.struct-table tbody tr:hover { background: #f9fafb; }
.struct-name { font-weight: 500; }
.struct-default { color: #9ca3af; font-style: italic; }
.struct-action { width: 36px; }
.type-badge {
  background: #f3f4f6; color: #6b7280; padding: 2px 8px; border-radius: 4px; font-size: 12px;
}
.badge {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 600;
}
.badge.pk { background: #fef3c7; color: #92400e; }
.badge.nn { background: #fee2e2; color: #991b1b; }
.badge.fk { background: #dbeafe; color: #1e40af; }

.select-hint {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; height: 200px; color: #9ca3af; gap: 10px;
}
.select-hint p { font-size: 13px; }

/* ── Buttons ── */
.btn-primary {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px; font-size: 13px; font-weight: 500;
  border: none; border-radius: 6px;
  background: #2563eb; color: #fff; cursor: pointer; transition: all 0.15s;
}
.btn-primary:hover { background: #1d4ed8; }
.btn-secondary {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px; font-size: 13px;
  border: 1px solid #d1d5db; border-radius: 6px;
  background: #fff; color: #374151; cursor: pointer; transition: all 0.15s;
}
.btn-secondary:hover { background: #f3f4f6; }
.btn-secondary.btn-warn { color: #d97706; border-color: #fbbf24; }
.btn-secondary.btn-warn:hover { background: #fffbeb; }
.btn-danger {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px; font-size: 13px;
  border: none; border-radius: 6px;
  background: #dc2626; color: #fff; cursor: pointer; transition: all 0.15s;
}
.btn-danger:hover { background: #b91c1c; }
.btn-primary.sm, .btn-secondary.sm, .btn-danger.sm { padding: 5px 10px; font-size: 12px; }

/* ── Modals ── */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 100;
}
.modal {
  background: #fff; border-radius: 12px; width: 90%; max-width: 560px;
  max-height: 85vh; display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
}
.modal-lg { max-width: 680px; }
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px; border-bottom: 1px solid #e5e7eb;
}
.modal-header h3 { margin: 0; font-size: 16px; font-weight: 600; color: #111827; }
.close-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border: none; border-radius: 6px;
  background: transparent; color: #9ca3af; cursor: pointer;
}
.close-btn:hover { background: #f3f4f6; color: #374151; }
.modal-body { flex: 1; overflow-y: auto; padding: 20px; }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 14px 20px; border-top: 1px solid #e5e7eb;
}

/* ── Form ── */
.field-label {
  display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;
}
.field-input {
  display: block; width: 100%; padding: 8px 10px; font-size: 13px;
  border: 1px solid #d1d5db; border-radius: 6px; color: #111827;
  outline: none; box-sizing: border-box; transition: border-color 0.15s;
}
.field-input:focus { border-color: #2563eb; }
.field-input:disabled { background: #f3f4f6; color: #9ca3af; }
.field-select {
  padding: 8px 10px; font-size: 13px; border: 1px solid #d1d5db;
  border-radius: 6px; color: #111827; outline: none; background: #fff; cursor: pointer;
}
.field-select:focus { border-color: #2563eb; }
.field-select:disabled { background: #f3f4f6; color: #9ca3af; cursor: default; }

/* ── Column Defs ── */
.col-defs { display: flex; flex-direction: column; gap: 12px; margin-bottom: 10px; }
.col-def-item {
  display: flex; flex-direction: column; gap: 4px;
  padding: 10px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;
}
.col-def-row { display: flex; gap: 8px; align-items: center; }
.col-name-input { flex: 1; }
.type-select { min-width: 140px; }
.col-type-hint { font-size: 11px; color: #9ca3af; padding-left: 2px; flex: 1; }
.col-extra-row { display: flex; gap: 8px; align-items: center; }
.default-input { width: 120px !important; flex: 0 0 auto; font-size: 12px !important; padding: 5px 8px !important; }
.fk-toggle { gap: 4px !important; color: #2563eb !important; font-weight: 500 !important; }
.fk-row { display: flex; gap: 8px; padding-left: 2px; }
.fk-select { flex: 1; font-size: 12px !important; }

.checkbox-label {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; color: #6b7280; white-space: nowrap; cursor: pointer;
}
.icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; flex-shrink: 0;
  border: 1px solid #e5e7eb; border-radius: 6px;
  background: #fff; color: #9ca3af; cursor: pointer;
}
.icon-btn:hover:not(:disabled) { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }
.icon-btn:disabled { opacity: 0.4; cursor: default; }

.add-col-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 12px; font-size: 12px;
  border: 1px dashed #d1d5db; border-radius: 6px;
  background: transparent; color: #6b7280; cursor: pointer; width: 100%;
  justify-content: center; transition: all 0.15s;
}
.add-col-btn:hover { border-color: #2563eb; color: #2563eb; }
</style>
