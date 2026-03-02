<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { X, Save, ChevronUp, ChevronDown, Columns2, RectangleHorizontal } from 'lucide-vue-next'

interface Dashboard {
  id: number; name: string; description: string; sort_order: number; analysis?: string; actions?: string
}
interface AvailableItem {
  id: number; name: string; type: 'chart' | 'metric'; category?: string
}
interface SelectedItem {
  item_type: 'chart' | 'metric'
  item_id: number
  name: string
  col_span: number
  sort_order: number
}

const props = defineProps<{ dashboard: Dashboard | null }>()
const emit = defineEmits<{ saved: []; cancel: [] }>()

const form = ref({ name: '', description: '', sort_order: 0, analysis: '', actions: '' })
const selectedItems = ref<SelectedItem[]>([])
const availableCharts = ref<AvailableItem[]>([])
const availableMetrics = ref<AvailableItem[]>([])
const saving = ref(false)
const error = ref('')

watch(() => props.dashboard, (d) => {
  if (d) {
    form.value = { name: d.name, description: d.description || '', sort_order: d.sort_order, analysis: (d as any).analysis || '', actions: (d as any).actions || '' }
  } else {
    form.value = { name: '', description: '', sort_order: 0, analysis: '', actions: '' }
  }
  selectedItems.value = []
  error.value = ''
}, { immediate: true })

onMounted(async () => {
  // 載入所有可用的 chart 和 metric
  const chartRes = await window.db.execute('SELECT id, name FROM chart ORDER BY name')
  if (chartRes.success && chartRes.rows) {
    availableCharts.value = chartRes.rows.map(r => ({ id: r.id as number, name: r.name as string, type: 'chart' as const }))
  }
  const metricRes = await window.db.execute('SELECT id, name, category FROM metric ORDER BY category, name')
  if (metricRes.success && metricRes.rows) {
    availableMetrics.value = metricRes.rows.map(r => ({
      id: r.id as number, name: r.name as string, type: 'metric' as const, category: r.category as string,
    }))
  }

  // 如果是編輯模式，載入已選的 items
  if (props.dashboard) {
    const itemsRes = await window.db.execute(
      `SELECT di.item_type, di.item_id, di.col_span, di.sort_order,
        COALESCE(c.name, m.name) as name
       FROM dashboard_item di
       LEFT JOIN chart c ON di.item_type='chart' AND c.id=di.item_id
       LEFT JOIN metric m ON di.item_type='metric' AND m.id=di.item_id
       WHERE di.dashboard_id = ? ORDER BY di.sort_order`,
      [props.dashboard.id]
    )
    if (itemsRes.success && itemsRes.rows) {
      selectedItems.value = itemsRes.rows.map(r => ({
        item_type: r.item_type as 'chart' | 'metric',
        item_id: r.item_id as number,
        name: r.name as string,
        col_span: r.col_span as number,
        sort_order: r.sort_order as number,
      }))
    }
  }
})

function isSelected(type: 'chart' | 'metric', id: number): boolean {
  return selectedItems.value.some(i => i.item_type === type && i.item_id === id)
}

function toggleItem(type: 'chart' | 'metric', id: number, name: string) {
  const idx = selectedItems.value.findIndex(i => i.item_type === type && i.item_id === id)
  if (idx >= 0) {
    selectedItems.value.splice(idx, 1)
  } else {
    selectedItems.value.push({
      item_type: type, item_id: id, name,
      col_span: type === 'chart' ? 2 : 1,
      sort_order: selectedItems.value.length,
    })
  }
}

function moveUp(idx: number) {
  if (idx <= 0) return
  const items = selectedItems.value
  ;[items[idx - 1], items[idx]] = [items[idx], items[idx - 1]]
}

function moveDown(idx: number) {
  const items = selectedItems.value
  if (idx >= items.length - 1) return
  ;[items[idx], items[idx + 1]] = [items[idx + 1], items[idx]]
}

function toggleSpan(idx: number) {
  selectedItems.value[idx].col_span = selectedItems.value[idx].col_span === 1 ? 2 : 1
}

async function save() {
  if (!form.value.name) {
    error.value = '名稱為必填'
    return
  }
  saving.value = true
  error.value = ''
  try {
    let dashboardId: number
    if (props.dashboard) {
      await window.db.execute(
        `UPDATE dashboard SET name=?, description=?, sort_order=?, analysis=?, actions=? WHERE id=?`,
        [form.value.name, form.value.description, form.value.sort_order, form.value.analysis, form.value.actions, props.dashboard.id]
      )
      dashboardId = props.dashboard.id
      // 清除舊 items
      await window.db.execute('DELETE FROM dashboard_item WHERE dashboard_id=?', [dashboardId])
    } else {
      const res = await window.db.execute(
        `INSERT INTO dashboard (name, description, sort_order, analysis, actions) VALUES (?, ?, ?, ?, ?)`,
        [form.value.name, form.value.description, form.value.sort_order, form.value.analysis, form.value.actions]
      )
      // 取新 id
      const idRes = await window.db.execute('SELECT last_insert_rowid() as id')
      dashboardId = (idRes.rows?.[0] as any)?.id ?? 0
    }

    // 插入 items
    for (let i = 0; i < selectedItems.value.length; i++) {
      const item = selectedItems.value[i]
      await window.db.execute(
        `INSERT INTO dashboard_item (dashboard_id, item_type, item_id, col_span, sort_order) VALUES (?,?,?,?,?)`,
        [dashboardId, item.item_type, item.item_id, item.col_span, i]
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
        <h3>{{ dashboard ? '編輯儀表板' : '新增儀表板' }}</h3>
        <button class="icon-btn" @click="emit('cancel')"><X :size="18" /></button>
      </div>

      <div class="drawer-body">
        <!-- 基本設定 -->
        <div class="section-title">基本設定</div>
        <div class="field">
          <label>名稱 <span class="req">*</span></label>
          <input v-model="form.name" placeholder="例：獲利總覽" />
        </div>
        <div class="field">
          <label>說明</label>
          <input v-model="form.description" placeholder="這個儀表板的用途" />
        </div>

        <!-- 智能分析與建議動作 -->
        <div class="section-title">智能分析</div>
        <div class="field">
          <textarea v-model="form.analysis" rows="4" placeholder="針對此儀表板的數據分析摘要"></textarea>
        </div>
        <div class="section-title">建議動作</div>
        <div class="field">
          <textarea v-model="form.actions" rows="4" placeholder="每行一條建議，例如：&#10;1. 檢討銷管研費用結構&#10;2. 設定下一年度營收目標"></textarea>
        </div>

        <!-- 選擇圖表 -->
        <div class="section-title">選擇圖表</div>
        <div v-if="availableCharts.length === 0" class="empty-hint">尚無圖表，請先到圖表 tab 新增</div>
        <div v-else class="pick-list">
          <label v-for="c in availableCharts" :key="'c'+c.id" class="pick-item">
            <input type="checkbox" :checked="isSelected('chart', c.id)" @change="toggleItem('chart', c.id, c.name)" />
            <span class="pick-badge chart">圖表</span>
            {{ c.name }}
          </label>
        </div>

        <!-- 選擇指標 -->
        <div class="section-title">選擇指標</div>
        <div v-if="availableMetrics.length === 0" class="empty-hint">尚無指標，請先到指標 tab 新增</div>
        <div v-else class="pick-list">
          <label v-for="m in availableMetrics" :key="'m'+m.id" class="pick-item">
            <input type="checkbox" :checked="isSelected('metric', m.id)" @change="toggleItem('metric', m.id, m.name)" />
            <span class="pick-badge metric">指標</span>
            {{ m.name }}
            <span class="pick-category">{{ m.category }}</span>
          </label>
        </div>

        <!-- 排列與寬度 -->
        <template v-if="selectedItems.length > 0">
          <div class="section-title">排列與佈局</div>
          <div class="arrange-list">
            <div v-for="(item, idx) in selectedItems" :key="item.item_type+item.item_id" class="arrange-item">
              <div class="arrange-info">
                <span :class="['pick-badge', item.item_type]">{{ item.item_type === 'chart' ? '圖表' : '指標' }}</span>
                <span class="arrange-name">{{ item.name }}</span>
              </div>
              <div class="arrange-actions">
                <button class="mini-btn" @click="toggleSpan(idx)" :title="item.col_span === 2 ? '切換半寬' : '切換全寬'">
                  <RectangleHorizontal v-if="item.col_span === 2" :size="14" />
                  <Columns2 v-else :size="14" />
                  <span>{{ item.col_span === 2 ? '全寬' : '半寬' }}</span>
                </button>
                <button class="mini-btn" @click="moveUp(idx)" :disabled="idx === 0"><ChevronUp :size="14" /></button>
                <button class="mini-btn" @click="moveDown(idx)" :disabled="idx === selectedItems.length - 1"><ChevronDown :size="14" /></button>
              </div>
            </div>
          </div>

          <!-- 佈局預覽 -->
          <div class="section-title">佈局預覽</div>
          <div class="layout-preview">
            <div
              v-for="(item, idx) in selectedItems"
              :key="'p'+idx"
              :class="['preview-item', item.item_type, { full: item.col_span === 2 }]"
            >
              {{ item.name }}
            </div>
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
.field input {
  width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;
  font-size: 13px; color: #111827; box-sizing: border-box;
}
.field input:focus, .field textarea:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.1); }
.field textarea {
  width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;
  font-size: 13px; color: #111827; box-sizing: border-box; font-family: inherit;
  resize: vertical; line-height: 1.6;
}

.empty-hint { font-size: 13px; color: #9ca3af; padding: 8px 0; }

.pick-list { display: flex; flex-direction: column; gap: 4px; }
.pick-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 6px; cursor: pointer;
  font-size: 13px; color: #374151;
  transition: background 0.1s;
}
.pick-item:hover { background: #f9fafb; }
.pick-item input { margin: 0; }
.pick-badge {
  display: inline-block; padding: 1px 6px; border-radius: 4px;
  font-size: 11px; font-weight: 500; flex-shrink: 0;
}
.pick-badge.chart { background: #dbeafe; color: #2563eb; }
.pick-badge.metric { background: #fef3c7; color: #d97706; }
.pick-category { font-size: 11px; color: #9ca3af; margin-left: auto; }

.arrange-list { display: flex; flex-direction: column; gap: 4px; }
.arrange-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px; background: #f9fafb; border: 1px solid #e5e7eb;
  border-radius: 6px; font-size: 13px;
}
.arrange-info { display: flex; align-items: center; gap: 8px; }
.arrange-name { color: #374151; font-weight: 500; }
.arrange-actions { display: flex; align-items: center; gap: 4px; }
.mini-btn {
  display: flex; align-items: center; gap: 3px;
  padding: 3px 8px; border: 1px solid #d1d5db; border-radius: 4px;
  background: #fff; color: #6b7280; cursor: pointer; font-size: 11px;
}
.mini-btn:hover { background: #f3f4f6; }
.mini-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.layout-preview {
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
  padding: 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;
}
.preview-item {
  padding: 10px; border-radius: 6px; font-size: 11px; font-weight: 500;
  text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.preview-item.chart { background: #dbeafe; color: #2563eb; border: 1px solid #bfdbfe; }
.preview-item.metric { background: #fef3c7; color: #d97706; border: 1px solid #fde68a; }
.preview-item.full { grid-column: 1 / -1; }

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
