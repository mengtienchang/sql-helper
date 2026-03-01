<script setup lang="ts">
import { ref, watch } from 'vue'
import { X, Play, Save } from 'lucide-vue-next'
import ResultsTable from './ResultsTable.vue'

interface Metric {
  id: number; name: string; category: string; sql: string; description: string
  unit: string; thresholds: string
}

const props = defineProps<{ metric: Metric | null }>()
const emit = defineEmits<{ saved: []; cancel: [] }>()

const form = ref({
  name: '', category: '', sql: '', description: '',
  unit: '', thresholdEnabled: false, thresholdGoodMin: 0, thresholdWarnMin: 0,
})
const saving = ref(false)
const testing = ref(false)
const previewResult = ref<any>(null)
const error = ref('')

watch(() => props.metric, (m) => {
  if (m) {
    let thresholdEnabled = false, thresholdGoodMin = 0, thresholdWarnMin = 0
    if (m.thresholds) {
      try {
        const t = JSON.parse(m.thresholds)
        thresholdEnabled = true
        thresholdGoodMin = t.good?.min ?? 0
        thresholdWarnMin = t.warn?.min ?? 0
      } catch {}
    }
    form.value = {
      name: m.name, category: m.category, sql: m.sql, description: m.description,
      unit: m.unit || '', thresholdEnabled, thresholdGoodMin, thresholdWarnMin,
    }
  } else {
    form.value = { name: '', category: '', sql: '', description: '', unit: '', thresholdEnabled: false, thresholdGoodMin: 0, thresholdWarnMin: 0 }
  }
  previewResult.value = null
  error.value = ''
}, { immediate: true })

async function testSql() {
  testing.value = true
  previewResult.value = null
  error.value = ''
  try {
    const result = await window.db.execute(`SELECT * FROM (${form.value.sql}) sub LIMIT 5`)
    if (result.success) {
      previewResult.value = result
    } else {
      error.value = result.message ?? '查詢失敗'
    }
  } catch (e) {
    error.value = String(e)
  }
  testing.value = false
}

async function save() {
  if (!form.value.name || !form.value.category || !form.value.sql) {
    error.value = '名稱、分類、SQL 為必填'
    return
  }
  saving.value = true
  error.value = ''
  const thresholds = form.value.thresholdEnabled
    ? JSON.stringify({ good: { min: form.value.thresholdGoodMin }, warn: { min: form.value.thresholdWarnMin } })
    : ''
  try {
    if (props.metric) {
      await window.db.execute(
        `UPDATE metric SET name=?, category=?, sql=?, description=?, unit=?, thresholds=? WHERE id=?`,
        [form.value.name, form.value.category, form.value.sql, form.value.description, form.value.unit, thresholds, props.metric.id]
      )
    } else {
      await window.db.execute(
        `INSERT INTO metric (name, category, sql, description, unit, thresholds) VALUES (?, ?, ?, ?, ?, ?)`,
        [form.value.name, form.value.category, form.value.sql, form.value.description, form.value.unit, thresholds]
      )
    }
    emit('saved')
  } catch (e) {
    error.value = String(e)
  }
  saving.value = false
}
</script>

<template>
  <div class="drawer-overlay" @click.self="emit('cancel')">
    <div class="drawer">
      <div class="drawer-header">
        <h3>{{ metric ? '編輯指標' : '新增指標' }}</h3>
        <button class="icon-btn" @click="emit('cancel')"><X :size="18" /></button>
      </div>

      <div class="drawer-body">
        <div class="field">
          <label>指標名稱 <span class="required">*</span></label>
          <input v-model="form.name" placeholder="例：變動成本小計" />
        </div>
        <div class="field">
          <label>分類 <span class="required">*</span></label>
          <input v-model="form.category" placeholder="例：成本分析" />
        </div>
        <div class="field">
          <label>說明</label>
          <input v-model="form.description" placeholder="指標的計算邏輯說明" />
        </div>
        <div class="field">
          <label>單位</label>
          <input v-model="form.unit" placeholder="例：% 或留空" style="max-width: 120px;" />
          <div class="field-hint">百分比指標填 %，離散數字留空</div>
        </div>

        <div class="field">
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.thresholdEnabled" />
            <span>啟用門檻判斷</span>
          </label>
          <div class="field-hint">為百分比指標設定良好/注意/異常的門檻值</div>
        </div>

        <div v-if="form.thresholdEnabled" class="threshold-fields">
          <div class="threshold-row">
            <label>良好 (&gt;=)</label>
            <input type="number" v-model.number="form.thresholdGoodMin" />
            <span class="threshold-badge good">良好</span>
          </div>
          <div class="threshold-row">
            <label>注意 (&gt;=)</label>
            <input type="number" v-model.number="form.thresholdWarnMin" />
            <span class="threshold-badge warn">注意</span>
          </div>
          <div class="threshold-hint">
            值 &gt;= {{ form.thresholdGoodMin }} → 良好（綠），&gt;= {{ form.thresholdWarnMin }} → 注意（黃），其餘 → 異常（紅）
          </div>
        </div>

        <div class="field">
          <label>SQL 查詢 <span class="required">*</span></label>
          <textarea v-model="form.sql" rows="6" placeholder="SELECT period, factory_id, (...) as value FROM financial_report" />
          <div class="field-hint">查詢須回傳 period, factory_id, value 欄位</div>
        </div>

        <button class="test-btn" @click="testSql" :disabled="testing || !form.sql">
          <Play :size="14" />
          <span>{{ testing ? '執行中...' : '測試執行' }}</span>
        </button>

        <div v-if="previewResult" class="preview-area">
          <ResultsTable :result="previewResult" />
        </div>

        <div v-if="error" class="error-msg">{{ error }}</div>
      </div>

      <div class="drawer-footer">
        <button class="cancel-btn" @click="emit('cancel')">取消</button>
        <button class="save-btn" @click="save" :disabled="saving">
          <Save :size="14" />
          <span>{{ saving ? '儲存中...' : '儲存' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.drawer-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.2); z-index: 99;
}
.drawer {
  position: fixed; right: 0; top: 0; height: 100vh; width: 480px;
  background: #fff; border-left: 1px solid #e5e7eb;
  box-shadow: -4px 0 20px rgba(0,0,0,0.08); z-index: 100;
  display: flex; flex-direction: column;
}
.drawer-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid #e5e7eb;
}
.drawer-header h3 { font-size: 16px; font-weight: 600; color: #111827; margin: 0; }
.icon-btn { border: none; background: none; color: #6b7280; cursor: pointer; padding: 4px; border-radius: 4px; }
.icon-btn:hover { background: #f3f4f6; }

.drawer-body { flex: 1; overflow-y: auto; padding: 20px; }

.field { margin-bottom: 16px; }
.field label { display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px; }
.required { color: #dc2626; }
.field input, .field textarea {
  width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;
  font-size: 13px; color: #111827; box-sizing: border-box;
}
.field textarea { font-family: 'SF Mono', 'Fira Code', monospace; resize: vertical; }
.field input:focus, .field textarea:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.1); }
.field-hint { font-size: 11px; color: #9ca3af; margin-top: 4px; }

.checkbox-label {
  display: flex; align-items: center; gap: 6px; cursor: pointer;
}
.checkbox-label input { margin: 0; }
.threshold-fields {
  padding: 12px; background: #f9fafb; border: 1px solid #e5e7eb;
  border-radius: 6px; margin-bottom: 16px;
}
.threshold-row {
  display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
}
.threshold-row label { min-width: 70px; font-size: 13px; color: #374151; font-weight: 500; }
.threshold-row input {
  width: 80px; padding: 6px 10px; border: 1px solid #d1d5db;
  border-radius: 6px; font-size: 13px; color: #111827;
}
.threshold-row input:focus { outline: none; border-color: #2563eb; }
.threshold-badge {
  font-size: 11px; font-weight: 500; padding: 2px 6px; border-radius: 4px;
}
.threshold-badge.good { background: #dcfce7; color: #16a34a; }
.threshold-badge.warn { background: #fef3c7; color: #d97706; }
.threshold-hint { font-size: 11px; color: #9ca3af; margin-top: 4px; }

.test-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 14px; font-size: 13px;
  border: 1px solid #d1d5db; border-radius: 6px;
  background: #fff; color: #374151; cursor: pointer;
}
.test-btn:hover { background: #f3f4f6; }
.test-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.preview-area {
  margin-top: 12px; max-height: 200px; overflow: auto;
  border: 1px solid #e5e7eb; border-radius: 6px;
}

.error-msg {
  margin-top: 12px; padding: 8px 12px; border-radius: 6px;
  font-size: 13px; background: #fef2f2; color: #dc2626;
}

.drawer-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 14px 20px; border-top: 1px solid #e5e7eb;
}
.cancel-btn {
  padding: 8px 16px; font-size: 13px; border: 1px solid #d1d5db;
  border-radius: 6px; background: #fff; color: #374151; cursor: pointer;
}
.cancel-btn:hover { background: #f3f4f6; }
.save-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 16px; font-size: 13px; border: none; border-radius: 6px;
  background: #2563eb; color: #fff; cursor: pointer;
}
.save-btn:hover { background: #1d4ed8; }
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
