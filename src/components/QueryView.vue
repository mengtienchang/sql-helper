<script setup lang="ts">
import { ref } from 'vue'
import { AlertCircle } from 'lucide-vue-next'
import { Search } from 'lucide-vue-next'
import QueryEditor from './QueryEditor.vue'
import ResultsTable from './ResultsTable.vue'

const queryResult = ref<any>(null)
const error = ref<string | null>(null)

async function executeQuery(sql: string) {
  error.value = null
  const result = await window.db.execute(sql)
  if (result.success) {
    queryResult.value = result
  } else {
    error.value = result.message ?? 'Unknown error'
    queryResult.value = null
  }
}
</script>

<template>
  <div class="query-view">
    <div class="page-header">
      <h2>SQL 查詢</h2>
      <p class="subtitle">自訂查詢分析資料</p>
    </div>

    <QueryEditor @execute="executeQuery" :disabled="false" />

    <div v-if="error" class="error">
      <AlertCircle :size="15" />
      <span>{{ error }}</span>
    </div>

    <ResultsTable v-if="queryResult" :result="queryResult" />
  </div>
</template>

<style scoped>
.query-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.page-header { padding: 24px 28px 16px; }
.page-header h2 { font-size: 22px; font-weight: 700; color: #111827; margin: 0; }
.subtitle { font-size: 14px; color: #6b7280; margin-top: 4px; }

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

.error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  color: #dc2626;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
  font-size: 13px;
}
</style>
