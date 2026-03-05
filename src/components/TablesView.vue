<script setup lang="ts">
import { ref } from 'vue'
import { Table2, RefreshCw, Plus, PlusCircle, Trash2, X, Columns } from 'lucide-vue-next'

interface ColInfo {
  cid: number; name: string; type: string; notnull: number; dflt_value: any; pk: number
}
interface Row { [key: string]: unknown }

const TYPES = ['TEXT', 'INTEGER', 'REAL', 'BLOB', 'NUMERIC']

// ── State ──
const tables = ref<string[]>([])
const activeTable = ref<string | null>(null)
const columns = ref<ColInfo[]>([])
const rows = ref<Row[]>([])
const rowids = ref<number[]>([])
const loading = ref(false)
const errorMsg = ref('')

// ── Create Table modal ──
const showCreateTable = ref(false)
const newTableName = ref('')
const newTableCols = ref<{ name: string; type: string; required: boolean }[]>([
  { name: '', type: 'TEXT', required: false }
])

// ── Add Column modal ──
const showAddCol = ref(false)
const newColName = ref('')
const newColType = ref('TEXT')
const newColDefault = ref('')

// ── Insert Row modal ──
const showInsertRow = ref(false)
const insertValues = ref<Record<string, string>>({})

// ── Drop Table confirm ──
const showDropTable = ref(false)

// ── Functions ──
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
  await loadTableData()
}

async function loadTableData() {
  if (!activeTable.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    const schemaResult = await window.db.execute(`PRAGMA table_info('${activeTable.value}')`)
    if (schemaResult.success) columns.value = schemaResult.rows as ColInfo[]

    const dataResult = await window.db.execute(`SELECT rowid as __rowid__, * FROM '${activeTable.value}' LIMIT 500`)
    if (dataResult.success) {
      rowids.value = (dataResult.rows as Row[]).map(r => r.__rowid__ as number)
      rows.value = (dataResult.rows as Row[]).map(r => {
        const { __rowid__, ...rest } = r
        return rest
      })
    } else {
      errorMsg.value = dataResult.message ?? '載入失敗'
    }
  } catch (e) {
    errorMsg.value = String(e)
  }
  loading.value = false
}

// Create Table
function openCreateTable() {
  newTableName.value = ''
  newTableCols.value = [{ name: '', type: 'TEXT', required: false }]
  showCreateTable.value = true
}
function addColDef() {
  newTableCols.value.push({ name: '', type: 'TEXT', required: false })
}
function removeColDef(i: number) {
  newTableCols.value.splice(i, 1)
}
async function createTable() {
  if (!newTableName.value.trim()) { alert('請輸入資料表名稱'); return }
  const validCols = newTableCols.value.filter(c => c.name.trim())
  if (validCols.length === 0) { alert('請至少新增一個欄位'); return }
  const colDefs = [
    'id INTEGER PRIMARY KEY AUTOINCREMENT',
    ...validCols.map(c => `"${c.name.trim()}" ${c.type}${c.required ? ' NOT NULL' : ''}`)
  ].join(', ')
  const sql = `CREATE TABLE "${newTableName.value.trim()}" (${colDefs})`
  const result = await window.db.execute(sql)
  if (result.success) {
    showCreateTable.value = false
    await refreshTables()
    await selectTable(newTableName.value.trim())
  } else {
    alert('建立失敗：' + result.message)
  }
}

// Add Column
function openAddCol() {
  newColName.value = ''
  newColType.value = 'TEXT'
  newColDefault.value = ''
  showAddCol.value = true
}
async function addColumn() {
  if (!newColName.value.trim()) { alert('請輸入欄位名稱'); return }
  const defaultPart = newColDefault.value.trim() ? ` DEFAULT '${newColDefault.value.trim()}'` : ''
  const sql = `ALTER TABLE "${activeTable.value}" ADD COLUMN "${newColName.value.trim()}" ${newColType.value}${defaultPart}`
  const result = await window.db.execute(sql)
  if (result.success) {
    showAddCol.value = false
    await loadTableData()
  } else {
    alert('新增欄位失敗：' + result.message)
  }
}

// Insert Row
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

// Delete Row
async function deleteRow(i: number) {
  if (!confirm('確定要刪除這筆資料？')) return
  const rowid = rowids.value[i]
  const result = await window.db.execute(`DELETE FROM "${activeTable.value}" WHERE rowid = ?`, [rowid])
  if (result.success) {
    await loadTableData()
  } else {
    alert('刪除失敗：' + result.message)
  }
}

// Drop Table
async function dropTable() {
  const result = await window.db.execute(`DROP TABLE "${activeTable.value}"`)
  if (result.success) {
    showDropTable.value = false
    activeTable.value = null
    columns.value = []
    rows.value = []
    rowids.value = []
    await refreshTables()
  } else {
    alert('刪除資料表失敗：' + result.message)
  }
}

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
        <button
          v-for="t in tables"
          :key="t"
          :class="['tab', { active: activeTable === t }]"
          @click="selectTable(t)"
        >
          <Table2 :size="14" />
          {{ t }}
        </button>
      </div>

      <!-- Selected table content -->
      <div v-if="activeTable" class="table-body">
        <!-- Toolbar -->
        <div class="table-toolbar">
          <span class="row-count">{{ rows.length }} 筆資料・{{ columns.length }} 個欄位</span>
          <div class="toolbar-actions">
            <button class="btn-secondary sm" @click="openAddCol">
              <Columns :size="13" />
              新增欄位
            </button>
            <button class="btn-secondary sm" @click="openInsertRow">
              <PlusCircle :size="13" />
              新增資料
            </button>
            <button class="btn-danger sm" @click="showDropTable = true">
              <Trash2 :size="13" />
              刪除資料表
            </button>
          </div>
        </div>

        <!-- Error -->
        <div v-if="errorMsg" class="error-bar">{{ errorMsg }}</div>

        <!-- Loading -->
        <div v-if="loading" class="loading-bar">載入中...</div>

        <!-- Data Table -->
        <div v-else class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th v-for="col in columns" :key="col.name">
                  <span class="col-name">{{ col.name }}</span>
                  <span class="col-type">{{ col.type }}</span>
                </th>
                <th class="action-col"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="rows.length === 0">
                <td :colspan="columns.length + 1" class="empty-rows">
                  尚無資料，點擊「新增資料」來新增
                </td>
              </tr>
              <tr v-for="(row, i) in rows" :key="i">
                <td v-for="col in columns" :key="col.name" class="cell">
                  {{ row[col.name] ?? '' }}
                </td>
                <td class="action-col">
                  <button class="delete-row-btn" @click="deleteRow(i)" title="刪除此列">
                    <Trash2 :size="13" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else class="select-hint">
        <Table2 :size="32" stroke-width="1" />
        <p>請選擇左側資料表以查看內容</p>
      </div>
    </div>

    <!-- ── Modals ── -->

    <!-- Create Table -->
    <div v-if="showCreateTable" class="modal-overlay" @click.self="showCreateTable = false">
      <div class="modal">
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

          <div class="col-defs">
            <div v-for="(col, i) in newTableCols" :key="i" class="col-def-row">
              <input v-model="col.name" class="field-input col-name-input" placeholder="欄位名稱" />
              <select v-model="col.type" class="field-select">
                <option v-for="t in TYPES" :key="t">{{ t }}</option>
              </select>
              <label class="checkbox-label">
                <input type="checkbox" v-model="col.required" />
                必填
              </label>
              <button class="icon-btn" @click="removeColDef(i)" :disabled="newTableCols.length === 1">
                <X :size="14" />
              </button>
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
      <div class="modal" style="max-width: 420px">
        <div class="modal-header">
          <h3>新增欄位 — {{ activeTable }}</h3>
          <button class="close-btn" @click="showAddCol = false"><X :size="18" /></button>
        </div>
        <div class="modal-body">
          <label class="field-label">欄位名稱</label>
          <input v-model="newColName" class="field-input" placeholder="例如：description" />
          <label class="field-label" style="margin-top: 12px">欄位類型</label>
          <select v-model="newColType" class="field-select" style="width: 100%">
            <option v-for="t in TYPES" :key="t">{{ t }}</option>
          </select>
          <label class="field-label" style="margin-top: 12px">預設值（選填）</label>
          <input v-model="newColDefault" class="field-input" placeholder="留空表示 NULL" />
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
            </label>
            <input
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

    <!-- Drop Table Confirm -->
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
  </div>
</template>

<style scoped>
/* ── Layout ── */
.tables-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px 28px 16px;
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

/* ── Table body ── */
.table-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

.table-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 28px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0;
  background: #f9fafb;
}
.row-count { font-size: 13px; color: #6b7280; }
.toolbar-actions { display: flex; gap: 8px; }

.error-bar { padding: 8px 28px; background: #fef2f2; color: #dc2626; font-size: 13px; }
.loading-bar { padding: 20px 28px; color: #6b7280; font-size: 13px; }

.data-table-wrap { flex: 1; overflow: auto; }

.data-table {
  width: 100%; border-collapse: collapse; font-size: 13px;
}
.data-table thead th {
  position: sticky; top: 0; z-index: 1;
  background: #f3f4f6; padding: 8px 12px;
  text-align: left; border-bottom: 1px solid #e5e7eb;
  white-space: nowrap; font-weight: 600; color: #374151;
}
.data-table thead th .col-name { display: block; }
.data-table thead th .col-type {
  display: block; font-size: 11px; font-weight: 400; color: #9ca3af;
}
.data-table tbody tr:hover { background: #f9fafb; }
.data-table tbody tr:nth-child(even) { background: #fafafa; }
.data-table tbody tr:nth-child(even):hover { background: #f3f4f6; }
.cell {
  padding: 7px 12px; border-bottom: 1px solid #f3f4f6;
  color: #374151; max-width: 300px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.action-col { width: 44px; padding: 4px 8px; text-align: center; }
.delete-row-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: none; border-radius: 6px;
  background: transparent; color: #9ca3af; cursor: pointer; transition: all 0.15s;
}
.delete-row-btn:hover { background: #fee2e2; color: #dc2626; }

.empty-rows { text-align: center; padding: 40px; color: #9ca3af; font-size: 13px; }

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

.btn-danger {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px; font-size: 13px;
  border: none; border-radius: 6px;
  background: #dc2626; color: #fff; cursor: pointer; transition: all 0.15s;
}
.btn-danger:hover { background: #b91c1c; }

.btn-primary.sm, .btn-secondary.sm, .btn-danger.sm {
  padding: 5px 11px; font-size: 12px;
}

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

/* ── Form elements ── */
.field-label {
  display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;
}
.field-input {
  display: block; width: 100%; padding: 8px 10px; font-size: 13px;
  border: 1px solid #d1d5db; border-radius: 6px; color: #111827;
  outline: none; box-sizing: border-box; transition: border-color 0.15s;
}
.field-input:focus { border-color: #2563eb; }
.field-select {
  padding: 8px 10px; font-size: 13px; border: 1px solid #d1d5db;
  border-radius: 6px; color: #111827; outline: none; background: #fff;
  cursor: pointer;
}
.field-select:focus { border-color: #2563eb; }

/* ── Column Defs ── */
.col-defs { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.col-def-row { display: flex; gap: 8px; align-items: center; }
.col-name-input { flex: 1; }
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
