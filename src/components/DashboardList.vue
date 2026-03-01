<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Pencil, Trash2 } from 'lucide-vue-next'
import DashboardForm from './DashboardForm.vue'

interface Dashboard {
  id: number; name: string; description: string; sort_order: number; created_at: string; item_count: number
}

const dashboards = ref<Dashboard[]>([])
const showForm = ref(false)
const editTarget = ref<Dashboard | null>(null)
const deleteConfirm = ref<number | null>(null)

async function load() {
  const res = await window.db.execute(
    `SELECT d.*, (SELECT COUNT(*) FROM dashboard_item di WHERE di.dashboard_id=d.id) as item_count
     FROM dashboard d ORDER BY d.sort_order, d.id`
  )
  if (res.success && res.rows) {
    dashboards.value = res.rows as any[]
  }
}

function openCreate() {
  editTarget.value = null
  showForm.value = true
}

function openEdit(d: Dashboard) {
  editTarget.value = d
  showForm.value = true
}

async function confirmDelete(id: number) {
  await window.db.execute('DELETE FROM dashboard_item WHERE dashboard_id=?', [id])
  await window.db.execute('DELETE FROM dashboard WHERE id=?', [id])
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
  <div class="dashboard-list">
    <div class="list-header">
      <span class="count">共 {{ dashboards.length }} 個儀表板</span>
      <button class="add-btn" @click="openCreate">
        <Plus :size="14" />
        <span>新增儀表板</span>
      </button>
    </div>

    <div v-if="dashboards.length === 0" class="empty">尚無儀表板，點擊上方按鈕新增</div>

    <table v-else class="data-table">
      <thead>
        <tr>
          <th>名稱</th>
          <th>說明</th>
          <th>項目數</th>
          <th style="width: 100px;">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="d in dashboards" :key="d.id">
          <td class="name-cell">{{ d.name }}</td>
          <td class="desc-cell">{{ d.description || '-' }}</td>
          <td><span class="count-badge">{{ d.item_count }} 個</span></td>
          <td class="action-cell">
            <template v-if="deleteConfirm === d.id">
              <button class="confirm-delete" @click="confirmDelete(d.id)">確定</button>
              <button class="cancel-delete" @click="deleteConfirm = null">取消</button>
            </template>
            <template v-else>
              <button class="icon-btn" @click="openEdit(d)" title="編輯"><Pencil :size="14" /></button>
              <button class="icon-btn danger" @click="deleteConfirm = d.id" title="刪除"><Trash2 :size="14" /></button>
            </template>
          </td>
        </tr>
      </tbody>
    </table>

    <DashboardForm
      v-if="showForm"
      :dashboard="editTarget"
      @saved="onSaved"
      @cancel="showForm = false"
    />
  </div>
</template>

<style scoped>
.dashboard-list { padding: 0; }
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
.name-cell { font-weight: 500; color: #111827; }
.desc-cell { color: #6b7280; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.count-badge {
  display: inline-block; padding: 2px 8px; border-radius: 10px;
  background: #f3f4f6; color: #374151; font-size: 12px; font-weight: 500;
}
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
