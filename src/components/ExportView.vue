<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Upload, Download, Trash2, Eye, Plus } from 'lucide-vue-next'
import ExportDialog from './ExportDialog.vue'

interface Template {
  id: number
  name: string
  description: string
  file_name: string
  created_at: string
}

const templates = ref<Template[]>([])
const loading = ref(true)

const showAdd = ref(false)
const addForm = ref({ name: '', description: '', filePath: '', fileName: '' })
const addSaving = ref(false)
const addError = ref('')

const previewVars = ref<{ templateName: string; vars: string[] } | null>(null)

const exportDialog = ref<{ id: number; name: string } | null>(null)

async function loadTemplates() {
  loading.value = true
  try {
    templates.value = await window.export.getTemplates()
  } catch (e) {
    console.error(e)
  }
  loading.value = false
}

onMounted(loadTemplates)

async function pickFile() {
  const result = await window.export.showOpenDialog()
  if (result) {
    addForm.value.filePath = typeof result === 'string' ? result : result
    addForm.value.fileName = typeof result === 'string'
      ? (result.split(/[/\\]/).pop() || result)
      : result
  }
}

async function saveTemplate() {
  if (!addForm.value.name || !addForm.value.filePath) {
    addError.value = '名稱與檔案為必填'
    return
  }
  addSaving.value = true
  addError.value = ''
  try {
    const res = await window.export.saveTemplate(
      addForm.value.filePath,
      addForm.value.name,
      addForm.value.description,
    )
    if (res.success) {
      showAdd.value = false
      addForm.value = { name: '', description: '', filePath: '', fileName: '' }
      await loadTemplates()
    } else {
      addError.value = res.message || '儲存失敗'
    }
  } catch (e) {
    addError.value = String(e)
  }
  addSaving.value = false
}

async function deleteTemplate(t: Template) {
  if (!confirm(`確定刪除模板「${t.name}」？`)) return
  try {
    await window.export.deleteTemplate(t.id)
    await loadTemplates()
  } catch (e) {
    alert(String(e))
  }
}

async function preview(t: Template) {
  try {
    const vars = await window.export.scanVars(t.id)
    previewVars.value = { templateName: t.name, vars }
  } catch (e) {
    alert(String(e))
  }
}

function openExport(t: Template) {
  exportDialog.value = { id: t.id, name: t.name }
}

function onExportDone() {
  exportDialog.value = null
}
</script>

<template>
  <div class="export-view">
    <div class="header">
      <div>
        <h2>匯出模板</h2>
        <p class="subtitle">上傳 Excel 模板，使用佔位符自動填入資料庫數據</p>
      </div>
      <button class="add-btn" @click="showAdd = true">
        <Plus :size="16" />
        <span>新增模板</span>
      </button>
    </div>

    <div class="hint-box">
      <strong>佔位符語法：</strong>
      <ul>
        <li><code>{<!-- -->{SQL:SELECT ...}<!-- -->}</code> — 執行 SQL，用結果值替換儲存格</li>
        <li><code>{<!-- -->{VAR:名稱}<!-- -->}</code> — 匯出時彈出輸入框讓使用者填值</li>
        <li><code>{<!-- -->{TABLE:SELECT ...}<!-- -->}</code> — 執行 SQL，結果展開為多行</li>
      </ul>
    </div>

    <div v-if="loading" class="loading">載入中...</div>

    <div v-else-if="templates.length === 0" class="empty">
      <Upload :size="32" />
      <p>尚無匯出模板，點擊「新增模板」上傳 Excel 範本</p>
    </div>

    <table v-else class="template-table">
      <thead>
        <tr>
          <th>名稱</th>
          <th>說明</th>
          <th>檔案</th>
          <th>建立時間</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in templates" :key="t.id">
          <td class="name-cell">{{ t.name }}</td>
          <td>{{ t.description || '—' }}</td>
          <td class="file-cell">{{ t.file_name }}</td>
          <td>{{ t.created_at?.slice(0, 10) }}</td>
          <td>
            <div class="actions">
              <button class="action-btn" title="預覽佔位符" @click="preview(t)">
                <Eye :size="14" />
              </button>
              <button class="action-btn primary" title="匯出" @click="openExport(t)">
                <Download :size="14" />
              </button>
              <button class="action-btn danger" title="刪除" @click="deleteTemplate(t)">
                <Trash2 :size="14" />
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Add template modal -->
    <div v-if="showAdd" class="modal-overlay" @click.self="showAdd = false">
      <div class="modal">
        <h3>新增匯出模板</h3>
        <div class="field">
          <label>模板名稱 <span class="required">*</span></label>
          <input v-model="addForm.name" placeholder="例：月報模板" />
        </div>
        <div class="field">
          <label>說明</label>
          <input v-model="addForm.description" placeholder="模板用途說明" />
        </div>
        <div class="field">
          <label>Excel 檔案 <span class="required">*</span></label>
          <div class="file-pick">
            <button class="pick-btn" @click="pickFile">
              <Upload :size="14" />
              <span>選擇檔案</span>
            </button>
            <span v-if="addForm.fileName" class="file-name">{{ addForm.fileName }}</span>
            <span v-else class="file-placeholder">尚未選擇</span>
          </div>
        </div>
        <div v-if="addError" class="error-msg">{{ addError }}</div>
        <div class="modal-footer">
          <button class="cancel-btn" @click="showAdd = false">取消</button>
          <button class="save-btn" @click="saveTemplate" :disabled="addSaving">
            {{ addSaving ? '儲存中...' : '儲存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Preview modal -->
    <div v-if="previewVars" class="modal-overlay" @click.self="previewVars = null">
      <div class="modal">
        <h3>佔位符預覽：{{ previewVars.templateName }}</h3>
        <div v-if="previewVars.vars.length > 0">
          <p class="preview-label">需要填入的變數（VAR）：</p>
          <div v-for="v in previewVars.vars" :key="v" class="var-tag">{{ v }}</div>
        </div>
        <p v-else class="no-vars">此模板無 VAR 變數，匯出時會直接執行 SQL 佔位符。</p>
        <div class="modal-footer">
          <button class="cancel-btn" @click="previewVars = null">關閉</button>
        </div>
      </div>
    </div>

    <!-- Export dialog -->
    <ExportDialog
      v-if="exportDialog"
      :templateId="exportDialog.id"
      :templateName="exportDialog.name"
      @close="exportDialog = null"
      @done="onExportDone"
    />
  </div>
</template>

<style scoped>
.export-view { padding: 24px 28px; overflow-y: auto; height: 100%; }

.header {
  display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px;
}
.header h2 { font-size: 20px; font-weight: 700; color: var(--text-primary, #111827); margin: 0 0 4px; }
.subtitle { font-size: 13px; color: var(--text-secondary, #6b7280); margin: 0; }

.add-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 16px; font-size: 13px; border: none; border-radius: 8px;
  background: #2563eb; color: #fff; cursor: pointer; font-weight: 500;
  white-space: nowrap;
}
.add-btn:hover { background: #1d4ed8; }

.hint-box {
  background: var(--card-bg, #f9fafb); border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px; padding: 14px 18px; margin-bottom: 20px;
  font-size: 13px; color: var(--text-secondary, #374151); line-height: 1.7;
}
.hint-box strong { color: var(--text-primary, #111827); }
.hint-box ul { margin: 6px 0 0; padding-left: 20px; }
.hint-box code { background: rgba(37,99,235,0.08); padding: 1px 5px; border-radius: 3px; font-size: 12px; color: #2563eb; }

.loading, .empty {
  text-align: center; padding: 40px; color: var(--text-secondary, #9ca3af);
}
.empty p { margin-top: 12px; font-size: 14px; }

.template-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.template-table thead th {
  text-align: left; padding: 10px 14px; background: var(--card-bg, #f3f4f6);
  color: var(--text-secondary, #374151); border-bottom: 2px solid var(--border-color, #e5e7eb);
  font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em;
}
.template-table tbody td {
  padding: 10px 14px; border-bottom: 1px solid var(--border-color, #f3f4f6);
  color: var(--text-primary, #1f2937);
}
.template-table tbody tr:hover td { background: var(--hover-bg, #eff6ff); }
.name-cell { font-weight: 500; }
.file-cell { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; color: var(--text-secondary, #6b7280); }

.actions { display: flex; gap: 6px; }
.action-btn {
  padding: 5px 8px; border: 1px solid #d1d5db; border-radius: 5px;
  background: #fff; color: #374151; cursor: pointer; display: flex; align-items: center;
  transition: all 0.15s;
}
.action-btn:hover { background: #f3f4f6; }
.action-btn.primary { color: #2563eb; border-color: #bfdbfe; }
.action-btn.primary:hover { background: #eff6ff; }
.action-btn.danger { color: #dc2626; border-color: #fecaca; }
.action-btn.danger:hover { background: #fef2f2; }

/* Modals */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.3);
  z-index: 100; display: flex; align-items: center; justify-content: center;
}
.modal {
  background: #fff; border-radius: 12px; width: 440px; padding: 24px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.15);
}
.modal h3 { font-size: 16px; font-weight: 600; color: #111827; margin: 0 0 16px; }

.field { margin-bottom: 14px; }
.field label { display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 5px; }
.required { color: #dc2626; }
.field input {
  width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;
  font-size: 13px; color: #111827; box-sizing: border-box;
}
.field input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.1); }

.file-pick { display: flex; align-items: center; gap: 10px; }
.pick-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 7px 14px; font-size: 13px; border: 1px solid #d1d5db;
  border-radius: 6px; background: #fff; color: #374151; cursor: pointer;
}
.pick-btn:hover { background: #f3f4f6; }
.file-name { font-size: 13px; color: #111827; font-weight: 500; }
.file-placeholder { font-size: 13px; color: #9ca3af; }

.error-msg {
  margin-bottom: 12px; padding: 8px 12px; border-radius: 6px;
  font-size: 13px; background: #fef2f2; color: #dc2626;
}

.modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.cancel-btn {
  padding: 8px 16px; font-size: 13px; border: 1px solid #d1d5db;
  border-radius: 6px; background: #fff; color: #374151; cursor: pointer;
}
.cancel-btn:hover { background: #f3f4f6; }
.save-btn {
  padding: 8px 16px; font-size: 13px; border: none; border-radius: 6px;
  background: #2563eb; color: #fff; cursor: pointer;
}
.save-btn:hover { background: #1d4ed8; }
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.preview-label { font-size: 13px; color: #374151; margin: 0 0 10px; }
.var-tag {
  display: inline-block; padding: 4px 10px; margin: 0 6px 6px 0;
  background: #eff6ff; color: #2563eb; border-radius: 5px;
  font-size: 13px; font-weight: 500;
}
.no-vars { font-size: 13px; color: #6b7280; }
</style>
