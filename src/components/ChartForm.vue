<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { X, Play, Save } from 'lucide-vue-next'
import ChartPreview from './ChartPreview.vue'

interface Chart {
  id: number; name: string; chart_type: string; sql: string
  x_column: string; series_columns: string; title: string
  y_formatter: string; stack: number; enabled: number
  sort_order: number; description: string
}

const props = defineProps<{ chart: Chart | null }>()
const emit = defineEmits<{ saved: []; cancel: [] }>()

const form = ref({
  name: '', chart_type: 'line' as string, sql: '', x_column: '',
  series_columns: [] as string[], title: '', y_formatter: '',
  stack: false, enabled: true, sort_order: 0, description: '',
})

const saving = ref(false)
const testing = ref(false)
const error = ref('')
const detectedColumns = ref<string[]>([])
const previewRows = ref<Record<string, unknown>[]>([])

watch(() => props.chart, (c) => {
  if (c) {
    let sc: string[] = []
    try { sc = JSON.parse(c.series_columns) } catch { sc = [] }
    form.value = {
      name: c.name, chart_type: c.chart_type, sql: c.sql,
      x_column: c.x_column, series_columns: sc, title: c.title || '',
      y_formatter: c.y_formatter || '', stack: !!c.stack,
      enabled: !!c.enabled, sort_order: c.sort_order, description: c.description || '',
    }
  } else {
    form.value = {
      name: '', chart_type: 'line', sql: '', x_column: '',
      series_columns: [], title: '', y_formatter: '',
      stack: false, enabled: true, sort_order: 0, description: '',
    }
  }
  detectedColumns.value = []
  previewRows.value = []
  error.value = ''
}, { immediate: true })

const valueColumns = computed(() =>
  detectedColumns.value.filter(c => c !== form.value.x_column)
)

async function testSql() {
  testing.value = true
  error.value = ''
  detectedColumns.value = []
  previewRows.value = []
  try {
    const result = await window.db.execute(form.value.sql)
    if (result.success && result.columns && result.rows) {
      detectedColumns.value = result.columns
      previewRows.value = result.rows
      // auto-select x_column if empty
      if (!form.value.x_column && result.columns.length > 0) {
        form.value.x_column = result.columns[0]
      }
      // auto-select series if empty
      if (form.value.series_columns.length === 0 && result.columns.length > 1) {
        form.value.series_columns = result.columns.filter(c => c !== form.value.x_column)
      }
    } else {
      error.value = result.message ?? '查詢失敗'
    }
  } catch (e) {
    error.value = String(e)
  }
  testing.value = false
}

function toggleSeries(col: string) {
  const idx = form.value.series_columns.indexOf(col)
  if (idx >= 0) {
    form.value.series_columns.splice(idx, 1)
  } else {
    form.value.series_columns.push(col)
  }
}

async function save() {
  if (!form.value.name || !form.value.sql || !form.value.x_column || !form.value.series_columns.length) {
    error.value = '名稱、SQL、X 軸欄位、數值欄位為必填'
    return
  }
  saving.value = true
  error.value = ''
  const sc = JSON.stringify(form.value.series_columns)
  try {
    if (props.chart) {
      await window.db.execute(
        `UPDATE chart SET name=?, chart_type=?, sql=?, x_column=?, series_columns=?, title=?, y_formatter=?, stack=?, enabled=?, sort_order=?, description=? WHERE id=?`,
        [form.value.name, form.value.chart_type, form.value.sql, form.value.x_column, sc,
         form.value.title, form.value.y_formatter, form.value.stack ? 1 : 0,
         form.value.enabled ? 1 : 0, form.value.sort_order, form.value.description, props.chart.id]
      )
    } else {
      await window.db.execute(
        `INSERT INTO chart (name, chart_type, sql, x_column, series_columns, title, y_formatter, stack, enabled, sort_order, description) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [form.value.name, form.value.chart_type, form.value.sql, form.value.x_column, sc,
         form.value.title, form.value.y_formatter, form.value.stack ? 1 : 0,
         form.value.enabled ? 1 : 0, form.value.sort_order, form.value.description]
      )
    }
    emit('saved')
  } catch (e) {
    error.value = String(e)
  }
  saving.value = false
}

const chartTypes = [
  { value: 'line', label: '折線圖' },
  { value: 'bar', label: '長條圖' },
  { value: 'stacked_bar', label: '堆疊長條圖' },
  { value: 'pie', label: '圓餅圖' },
]
</script>

<template>
  <div class="drawer-overlay" @click.self="emit('cancel')">
    <div class="drawer">
      <div class="drawer-header">
        <h3>{{ chart ? '編輯圖表' : '新增圖表' }}</h3>
        <button class="icon-btn" @click="emit('cancel')"><X :size="18" /></button>
      </div>

      <div class="drawer-body">
        <!-- 基本設定 -->
        <div class="section-title">基本設定</div>
        <div class="field-row">
          <div class="field flex-1">
            <label>圖表名稱 <span class="req">*</span></label>
            <input v-model="form.name" placeholder="例：各期營收趨勢" />
          </div>
          <div class="field" style="width: 140px;">
            <label>類型</label>
            <select v-model="form.chart_type">
              <option v-for="t in chartTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>說明</label>
          <input v-model="form.description" placeholder="圖表的用途說明" />
        </div>
        <div class="field-row">
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.enabled" /> 在 Dashboard 顯示
          </label>
          <div class="field" style="width: 100px;">
            <label>排序</label>
            <input type="number" v-model.number="form.sort_order" min="0" />
          </div>
        </div>

        <!-- 資料來源 -->
        <div class="section-title">資料來源</div>
        <div class="field">
          <label>SQL 查詢 <span class="req">*</span></label>
          <textarea v-model="form.sql" rows="5" placeholder="SELECT period, SUM(財報營收) as 營收 FROM financial_report GROUP BY period" />
        </div>
        <button class="test-btn" @click="testSql" :disabled="testing || !form.sql">
          <Play :size="14" />
          <span>{{ testing ? '查詢中...' : '測試查詢' }}</span>
        </button>

        <!-- 欄位對應 -->
        <template v-if="detectedColumns.length > 0">
          <div class="section-title">欄位對應</div>
          <div class="field">
            <label>X 軸欄位 <span class="req">*</span></label>
            <select v-model="form.x_column">
              <option v-for="c in detectedColumns" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div class="field">
            <label>數值欄位 <span class="req">*</span></label>
            <div class="checkbox-group">
              <label v-for="c in valueColumns" :key="c" class="checkbox-item">
                <input type="checkbox" :checked="form.series_columns.includes(c)" @change="toggleSeries(c)" />
                {{ c }}
              </label>
            </div>
          </div>
        </template>

        <!-- 顯示設定 -->
        <template v-if="detectedColumns.length > 0">
          <div class="section-title">顯示設定</div>
          <div class="field-row">
            <div class="field flex-1">
              <label>圖表標題</label>
              <input v-model="form.title" placeholder="顯示在圖表上方" />
            </div>
            <div class="field" style="width: 140px;">
              <label>Y 軸格式</label>
              <input v-model="form.y_formatter" placeholder="{v}萬" />
            </div>
          </div>
          <label v-if="form.chart_type === 'bar' || form.chart_type === 'stacked_bar'" class="checkbox-label">
            <input type="checkbox" v-model="form.stack" /> 堆疊顯示
          </label>
        </template>

        <!-- 圖表預覽 -->
        <template v-if="previewRows.length > 0 && form.x_column && form.series_columns.length > 0">
          <div class="section-title">預覽</div>
          <div class="preview-box">
            <ChartPreview
              :rows="previewRows"
              :chart-type="form.chart_type"
              :x-column="form.x_column"
              :series-columns="form.series_columns"
              :y-formatter="form.y_formatter"
              :stack="form.stack"
            />
          </div>
        </template>

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
.drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.2); z-index: 99; }
.drawer {
  position: fixed; right: 0; top: 0; height: 100vh; width: 560px;
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

.section-title {
  font-size: 13px; font-weight: 600; color: #374151;
  margin: 20px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #f3f4f6;
}
.section-title:first-child { margin-top: 0; }

.field { margin-bottom: 12px; }
.field label { display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px; }
.req { color: #dc2626; }
.field input, .field textarea, .field select {
  width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;
  font-size: 13px; color: #111827; box-sizing: border-box;
}
.field textarea { font-family: 'SF Mono', 'Fira Code', monospace; resize: vertical; }
.field input:focus, .field textarea:focus, .field select:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.1); }

.field-row { display: flex; gap: 12px; align-items: flex-end; }
.flex-1 { flex: 1; }

.checkbox-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: #374151; margin-bottom: 12px; cursor: pointer;
}
.checkbox-group { display: flex; flex-wrap: wrap; gap: 8px; }
.checkbox-item {
  display: flex; align-items: center; gap: 4px;
  font-size: 13px; color: #374151; cursor: pointer;
  padding: 4px 10px; border: 1px solid #e5e7eb; border-radius: 6px;
  background: #f9fafb;
}
.checkbox-item:has(input:checked) { background: #eff6ff; border-color: #2563eb; color: #2563eb; }
.checkbox-item input { margin: 0; }

.test-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 14px; font-size: 13px;
  border: 1px solid #d1d5db; border-radius: 6px;
  background: #fff; color: #374151; cursor: pointer;
}
.test-btn:hover { background: #f3f4f6; }
.test-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.preview-box {
  height: 280px; border: 1px solid #e5e7eb; border-radius: 8px;
  background: #fff; padding: 8px;
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
