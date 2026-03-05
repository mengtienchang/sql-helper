<script setup lang="ts">
import { ref } from 'vue'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader } from 'lucide-vue-next'

const isElectron = !!(window as any).imp?.showOpenDialog

const dragOver = ref(false)
const loading = ref(false)
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null)

// Preview state
const previewColumns = ref<string[]>([])
const previewRows = ref<Record<string, unknown>[]>([])
const totalRows = ref(0)
const fileName = ref('')

// Import options
const tableName = ref('')
const importMode = ref<'create' | 'append'>('create')
const existingTables = ref<string[]>([])

// File reference for web mode
let pendingFile: File | null = null
let pendingFilePath: string | null = null

function sanitizeName(name: string): string {
  return name.replace(/\.(csv|xlsx|xls)$/i, '').replace(/[^a-zA-Z0-9_\u4e00-\u9fff]/g, '_')
}

async function loadTables() {
  const result = await window.db.tables()
  if (result.success && result.tables) {
    existingTables.value = result.tables.filter(t => !t.startsWith('_'))
  }
}

async function handleFile(file: File) {
  pendingFile = file
  pendingFilePath = null
  fileName.value = file.name
  tableName.value = sanitizeName(file.name)
  message.value = null
  loading.value = true

  try {
    await loadTables()

    if (isElectron) {
      // Electron: can't use File directly, need to re-pick via dialog
      // But for drag-drop we don't have the path. Use web import API fallback.
    }

    // Web mode: use webImportApi via window.imp
    const result = await (window as any).imp.preview(file)
    if (result.success) {
      previewColumns.value = result.columns
      previewRows.value = result.rows
      totalRows.value = result.totalRows
    } else {
      message.value = { type: 'error', text: result.message || '預覽失敗' }
    }
  } catch (err) {
    message.value = { type: 'error', text: String(err) }
  }
  loading.value = false
}

async function handleElectronPick() {
  loading.value = true
  message.value = null
  try {
    await loadTables()
    const filePath = await window.imp.showOpenDialog!()
    if (!filePath) { loading.value = false; return }

    pendingFilePath = filePath
    pendingFile = null
    const name = filePath.split(/[\\/]/).pop() || 'import'
    fileName.value = name
    tableName.value = sanitizeName(name)

    const result = await window.imp.preview(filePath)
    if (result.success) {
      previewColumns.value = result.columns
      previewRows.value = result.rows
      totalRows.value = result.totalRows
    } else {
      message.value = { type: 'error', text: result.message || '預覽失敗' }
    }
  } catch (err) {
    message.value = { type: 'error', text: String(err) }
  }
  loading.value = false
}

async function handleWebPick() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.csv,.xlsx,.xls'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (file) await handleFile(file)
  }
  input.click()
}

function pickFile() {
  if (isElectron) handleElectronPick()
  else handleWebPick()
}

function handleDrop(event: DragEvent) {
  dragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) handleFile(file)
}

async function doImport() {
  if (!tableName.value.trim()) {
    message.value = { type: 'error', text: '請輸入資料表名稱' }
    return
  }

  loading.value = true
  message.value = null

  try {
    let result: { success: boolean; message: string; rowCount?: number }

    if (pendingFilePath) {
      // Electron path-based import
      result = await window.imp.execute(pendingFilePath, tableName.value.trim(), importMode.value)
    } else if (pendingFile) {
      // Web file-based import
      result = await (window as any).imp.execute(pendingFile, tableName.value.trim(), importMode.value)
    } else {
      message.value = { type: 'error', text: '請先選擇檔案' }
      loading.value = false
      return
    }

    if (result.success) {
      message.value = {
        type: 'success',
        text: `匯入成功！表「${tableName.value}」共 ${result.rowCount ?? 0} 筆資料`,
      }
      // Reset preview
      previewColumns.value = []
      previewRows.value = []
      totalRows.value = 0
      pendingFile = null
      pendingFilePath = null
    } else {
      message.value = { type: 'error', text: result.message || '匯入失敗' }
    }
  } catch (err) {
    message.value = { type: 'error', text: String(err) }
  }
  loading.value = false
}

function resetAll() {
  previewColumns.value = []
  previewRows.value = []
  totalRows.value = 0
  fileName.value = ''
  tableName.value = ''
  message.value = null
  pendingFile = null
  pendingFilePath = null
}
</script>

<template>
  <div class="import-view">
    <div class="page-header">
      <h2>匯入資料</h2>
      <p class="subtitle">從 CSV / Excel 檔案匯入數據到資料庫</p>
    </div>

    <div class="import-content">
      <!-- Drop Zone (show when no preview) -->
      <div
        v-if="previewColumns.length === 0 && !loading"
        class="drop-zone"
        :class="{ 'drag-over': dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="handleDrop"
      >
        <FileSpreadsheet :size="40" stroke-width="1.2" />
        <p class="drop-title">拖曳檔案到這裡</p>
        <p class="drop-hint">支援 .csv 和 .xlsx 格式</p>
        <button class="browse-btn" @click="pickFile">
          <Upload :size="14" />
          <span>選擇檔案</span>
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="loading-state">
        <Loader :size="24" class="spin" />
        <span>處理中...</span>
      </div>

      <!-- Preview -->
      <div v-if="previewColumns.length > 0 && !loading" class="preview-section">
        <div class="preview-header">
          <div class="file-info">
            <FileSpreadsheet :size="16" />
            <span class="file-name">{{ fileName }}</span>
            <span class="file-meta">{{ previewColumns.length }} 欄 · {{ totalRows }} 筆</span>
          </div>
          <button class="btn-text" @click="resetAll">重新選擇</button>
        </div>

        <!-- Preview Table -->
        <div class="preview-table-wrap">
          <table class="preview-table">
            <thead>
              <tr>
                <th v-for="col in previewColumns" :key="col">{{ col }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in previewRows" :key="i">
                <td v-for="col in previewColumns" :key="col">{{ row[col] ?? '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="totalRows > 10" class="preview-note">僅顯示前 10 筆預覽資料</p>

        <!-- Import Options -->
        <div class="import-options">
          <div class="field">
            <label>目標資料表名稱</label>
            <input v-model="tableName" class="field-input" placeholder="輸入表名" />
          </div>
          <div class="field">
            <label>匯入模式</label>
            <div class="mode-group">
              <label class="radio-label" :class="{ active: importMode === 'create' }">
                <input type="radio" v-model="importMode" value="create" />
                建立新表
                <small>如果同名表已存在會先刪除</small>
              </label>
              <label class="radio-label" :class="{ active: importMode === 'append' }">
                <input type="radio" v-model="importMode" value="append" />
                附加到現有表
                <small>資料追加到已存在的表中</small>
              </label>
            </div>
          </div>
          <div v-if="importMode === 'append' && existingTables.length > 0" class="field">
            <label>選擇現有表</label>
            <select v-model="tableName" class="field-select">
              <option v-for="t in existingTables" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
        </div>

        <button class="import-btn" @click="doImport" :disabled="loading || !tableName.trim()">
          <Upload :size="14" />
          <span>匯入 {{ totalRows }} 筆資料</span>
        </button>
      </div>

      <!-- Message -->
      <div v-if="message" :class="['message', message.type]">
        <CheckCircle v-if="message.type === 'success'" :size="15" />
        <AlertCircle v-else :size="15" />
        <span>{{ message.text }}</span>
      </div>

      <!-- Tips -->
      <div class="import-tips">
        <h3>匯入說明</h3>
        <ul>
          <li>CSV 檔案：DuckDB 自動偵測分隔符、編碼和資料型別</li>
          <li>Excel 檔案：讀取第一個工作表</li>
          <li>第一列作為欄位名稱</li>
          <li>「建立新表」會自動根據資料建立欄位結構</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.import-view { flex: 1; overflow-y: auto; padding: 24px 28px; }
.page-header { margin-bottom: 24px; }
.page-header h2 { font-size: 22px; font-weight: 700; color: #111827; margin: 0; }
.subtitle { font-size: 14px; color: #6b7280; margin-top: 4px; }

.import-content { max-width: 720px; }

.drop-zone {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 40px; border: 2px dashed #d1d5db; border-radius: 12px;
  background: #f9fafb; color: #6b7280; transition: all 0.2s; cursor: pointer;
}
.drop-zone.drag-over { border-color: #2563eb; background: #eff6ff; }
.drop-title { font-size: 16px; font-weight: 600; color: #374151; margin: 4px 0 0; }
.drop-hint { font-size: 13px; color: #9ca3af; }
.browse-btn {
  display: flex; align-items: center; gap: 6px; margin-top: 8px; padding: 8px 20px;
  background: #2563eb; color: #fff; border: none; border-radius: 6px;
  font-size: 13px; font-weight: 500; cursor: pointer;
}
.browse-btn:hover { background: #1d4ed8; }

.loading-state {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 40px; color: #6b7280; font-size: 14px;
}
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* Preview */
.preview-section { display: flex; flex-direction: column; gap: 16px; }

.preview-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #f0f9ff; border: 1px solid #bae6fd;
  border-radius: 8px;
}
.file-info { display: flex; align-items: center; gap: 8px; color: #0369a1; }
.file-name { font-weight: 600; font-size: 14px; }
.file-meta { font-size: 12px; color: #0284c7; }
.btn-text {
  border: none; background: none; color: #2563eb; cursor: pointer;
  font-size: 13px; font-weight: 500; text-decoration: underline;
}
.btn-text:hover { color: #1d4ed8; }

.preview-table-wrap {
  overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 8px; max-height: 320px;
}
.preview-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.preview-table thead th {
  position: sticky; top: 0; background: #f3f4f6; padding: 8px 12px;
  text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb;
  white-space: nowrap;
}
.preview-table tbody td {
  padding: 6px 12px; border-bottom: 1px solid #f3f4f6; color: #374151;
  max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.preview-table tbody tr:hover { background: #f9fafb; }
.preview-note { font-size: 12px; color: #9ca3af; text-align: center; margin: 0; }

/* Import Options */
.import-options {
  display: flex; flex-direction: column; gap: 14px;
  padding: 16px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;
}
.field label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
.field-input {
  width: 100%; padding: 8px 10px; font-size: 13px; border: 1px solid #d1d5db;
  border-radius: 6px; color: #111827; outline: none; box-sizing: border-box;
}
.field-input:focus { border-color: #2563eb; }
.field-select {
  width: 100%; padding: 8px 10px; font-size: 13px; border: 1px solid #d1d5db;
  border-radius: 6px; color: #111827; outline: none; background: #fff; cursor: pointer;
}

.mode-group { display: flex; gap: 8px; }
.radio-label {
  flex: 1; display: flex; flex-direction: column; gap: 2px;
  padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px;
  cursor: pointer; font-size: 13px; font-weight: 500; color: #374151; transition: all 0.15s;
}
.radio-label.active { border-color: #2563eb; background: #eff6ff; color: #1d4ed8; }
.radio-label input { margin-right: 6px; }
.radio-label small { font-size: 11px; color: #9ca3af; font-weight: 400; }

.import-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; padding: 10px; font-size: 14px; font-weight: 600;
  border: none; border-radius: 8px; background: #2563eb; color: #fff; cursor: pointer;
}
.import-btn:hover { background: #1d4ed8; }
.import-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.message {
  display: flex; align-items: center; gap: 8px; margin-top: 16px;
  padding: 10px 14px; border-radius: 8px; font-size: 13px;
}
.message.success { background: #f0fdf4; color: #16a34a; }
.message.error { background: #fef2f2; color: #dc2626; }

.import-tips {
  margin-top: 24px; padding: 16px 20px; background: #f9fafb; border-radius: 8px;
}
.import-tips h3 { font-size: 14px; font-weight: 600; color: #374151; margin: 0 0 10px; }
.import-tips ul { margin: 0; padding-left: 20px; }
.import-tips li { font-size: 13px; color: #6b7280; line-height: 1.8; }
</style>
