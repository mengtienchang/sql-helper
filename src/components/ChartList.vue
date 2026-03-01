<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-vue-next'
import ChartForm from './ChartForm.vue'

interface Chart {
  id: number; name: string; chart_type: string; sql: string
  x_column: string; series_columns: string; title: string
  y_formatter: string; stack: number; enabled: number
  sort_order: number; description: string; created_at: string
}

const charts = ref<Chart[]>([])
const showForm = ref(false)
const editTarget = ref<Chart | null>(null)
const deleteConfirm = ref<number | null>(null)

const typeLabels: Record<string, string> = {
  line: '折線圖', bar: '長條圖', stacked_bar: '堆疊長條', pie: '圓餅圖',
}

async function load() {
  const res = await window.db.execute('SELECT * FROM chart ORDER BY sort_order, id')
  if (res.success && res.rows) {
    charts.value = res.rows as any[]
  }
}

function openCreate() {
  editTarget.value = null
  showForm.value = true
}

function openEdit(c: Chart) {
  editTarget.value = c
  showForm.value = true
}

async function toggleEnabled(c: Chart) {
  const newVal = c.enabled ? 0 : 1
  await window.db.execute('UPDATE chart SET enabled = ? WHERE id = ?', [newVal, c.id])
  load()
}

async function confirmDelete(id: number) {
  await window.db.execute('DELETE FROM chart WHERE id = ?', [id])
  deleteConfirm.value = null
  load()
}

function onSaved() {
  showForm.value = false
  load()
}

onMounted(load)
</script>

<template>
  <div class="chart-list">
    <div class="list-header">
      <span class="count">共 {{ charts.length }} 個圖表</span>
      <button class="add-btn" @click="openCreate">
        <Plus :size="14" />
        <span>新增圖表</span>
      </button>
    </div>

    <div v-if="charts.length === 0" class="empty">尚無圖表定義</div>

    <table v-else class="data-table">
      <thead>
        <tr>
          <th>名稱</th>
          <th>類型</th>
          <th>說明</th>
          <th>狀態</th>
          <th style="width: 120px;">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in charts" :key="c.id" :class="{ disabled: !c.enabled }">
          <td class="name-cell">{{ c.name }}</td>
          <td><span class="type-badge">{{ typeLabels[c.chart_type] || c.chart_type }}</span></td>
          <td class="desc-cell">{{ c.description || '-' }}</td>
          <td>
            <span :class="['status-badge', c.enabled ? 'active' : 'inactive']">
              {{ c.enabled ? '啟用' : '停用' }}
            </span>
          </td>
          <td class="action-cell">
            <template v-if="deleteConfirm === c.id">
              <button class="confirm-delete" @click="confirmDelete(c.id)">確定</button>
              <button class="cancel-delete" @click="deleteConfirm = null">取消</button>
            </template>
            <template v-else>
              <button class="icon-btn" @click="toggleEnabled(c)" :title="c.enabled ? '停用' : '啟用'">
                <Eye v-if="c.enabled" :size="14" />
                <EyeOff v-else :size="14" />
              </button>
              <button class="icon-btn" @click="openEdit(c)" title="編輯"><Pencil :size="14" /></button>
              <button class="icon-btn danger" @click="deleteConfirm = c.id" title="刪除"><Trash2 :size="14" /></button>
            </template>
          </td>
        </tr>
      </tbody>
    </table>

    <ChartForm
      v-if="showForm"
      :chart="editTarget"
      @saved="onSaved"
      @cancel="showForm = false"
    />
  </div>
</template>

<style scoped>
.chart-list { padding: 0; }
.list-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px;
}
.count { font-size: 13px; color: #6b7280; }
.add-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px; font-size: 13px; border: none; border-radius: 6px;
  background: #2563eb; color: #fff; cursor: pointer;
}
.add-btn:hover { background: #1d4ed8; }

.empty { text-align: center; padding: 40px; color: #9ca3af; font-size: 14px; }

.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th {
  text-align: left; padding: 10px 12px; font-weight: 500; color: #6b7280;
  border-bottom: 1px solid #e5e7eb; background: #f9fafb;
}
.data-table td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; color: #374151; }
.data-table tr.disabled { opacity: 0.5; }
.name-cell { font-weight: 500; color: #111827; }
.desc-cell { color: #6b7280; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.type-badge {
  display: inline-block; padding: 2px 8px; border-radius: 10px;
  background: #f3f4f6; color: #374151; font-size: 12px; font-weight: 500;
}
.status-badge {
  display: inline-block; padding: 2px 8px; border-radius: 10px;
  font-size: 12px; font-weight: 500;
}
.status-badge.active { background: #d1fae5; color: #059669; }
.status-badge.inactive { background: #f3f4f6; color: #9ca3af; }

.action-cell { white-space: nowrap; }
.icon-btn {
  border: none; background: none; color: #6b7280; cursor: pointer;
  padding: 4px; border-radius: 4px; margin-right: 4px;
}
.icon-btn:hover { background: #f3f4f6; color: #374151; }
.icon-btn.danger:hover { background: #fef2f2; color: #dc2626; }
.confirm-delete {
  padding: 2px 8px; font-size: 12px; border: none; border-radius: 4px;
  background: #dc2626; color: #fff; cursor: pointer; margin-right: 4px;
}
.cancel-delete {
  padding: 2px 8px; font-size: 12px; border: 1px solid #d1d5db; border-radius: 4px;
  background: #fff; color: #374151; cursor: pointer;
}
</style>
