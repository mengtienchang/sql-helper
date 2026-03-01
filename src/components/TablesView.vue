<script setup lang="ts">
import { ref } from 'vue'
import { Table2, RefreshCw } from 'lucide-vue-next'
import ResultsTable from './ResultsTable.vue'

const tables = ref<string[]>([])
const activeTable = ref<string | null>(null)
const queryResult = ref<any>(null)

async function refreshTables() {
  const result = await window.db.tables()
  console.log('[tables] result:', result)
  if (result.success && result.tables) {
    tables.value = result.tables.filter(t => !t.startsWith('_'))
    console.log('[tables] filtered:', tables.value)
  }
}

async function selectTable(name: string) {
  activeTable.value = name
  const result = await window.db.execute(`SELECT * FROM '${name}' LIMIT 200`)
  if (result.success) {
    queryResult.value = result
  }
}

refreshTables()
</script>

<template>
  <div class="tables-view">
    <div class="page-header">
      <div>
        <h2>資料表</h2>
        <p class="subtitle">瀏覽資料庫中的表格</p>
      </div>
      <button class="refresh-btn" @click="refreshTables">
        <RefreshCw :size="14" />
        <span>重新整理</span>
      </button>
    </div>

    <div v-if="tables.length === 0" class="empty-state">
      <Table2 :size="48" stroke-width="1" />
      <p>目前沒有資料表，請先匯入資料</p>
    </div>

    <div v-else class="tables-content">
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

      <div class="table-data">
        <ResultsTable v-if="queryResult" :result="queryResult" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tables-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px 28px 16px;
}
.page-header h2 { font-size: 22px; font-weight: 700; color: #111827; margin: 0; }
.subtitle { font-size: 14px; color: #6b7280; margin-top: 4px; }
.refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 13px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #374151;
  cursor: pointer;
}
.refresh-btn:hover { background: #f3f4f6; }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: #9ca3af;
  gap: 12px;
}
.empty-state p { font-size: 14px; }

.tables-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.table-tabs {
  display: flex;
  gap: 4px;
  padding: 0 28px;
  border-bottom: 1px solid #e5e7eb;
  overflow-x: auto;
}
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  transition: all 0.15s;
}
.tab:hover { color: #374151; }
.tab.active { color: #2563eb; border-bottom-color: #2563eb; font-weight: 500; }
.table-data { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
</style>
