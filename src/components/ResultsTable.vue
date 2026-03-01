<script setup lang="ts">
import { ref } from 'vue'
import { CheckCircle, Download } from 'lucide-vue-next'

const props = defineProps<{
  result: {
    type?: string
    columns?: string[]
    rows?: Record<string, unknown>[]
    changes?: number
  }
}>()

const exporting = ref(false)

async function exportExcel() {
  if (!props.result.columns || !props.result.rows) return
  exporting.value = true
  try {
    const res = await window.export.simple({
      columns: props.result.columns,
      rows: props.result.rows,
    })
    if (!res.success) {
      alert(res.message || '匯出失敗')
    }
  } catch (e) {
    alert(String(e))
  }
  exporting.value = false
}
</script>

<template>
  <div class="results">
    <div v-if="result.type === 'select' && result.rows" class="table-container">
      <div class="result-info">
        <span>{{ result.rows.length }} row(s) returned</span>
        <button class="export-btn" @click="exportExcel" :disabled="exporting || !result.rows.length">
          <Download :size="13" />
          <span>{{ exporting ? '匯出中...' : '匯出 Excel' }}</span>
        </button>
      </div>
      <div class="table-scroll">
        <table v-if="result.rows.length > 0">
          <thead>
            <tr>
              <th v-for="col in result.columns" :key="col">{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in result.rows" :key="idx">
              <td v-for="col in result.columns" :key="col">
                <span v-if="row[col] === null" class="null-value">NULL</span>
                <span v-else>{{ row[col] }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="result.rows.length === 0" class="empty">No rows returned</div>
    </div>

    <div v-else-if="result.type === 'modify'" class="modify-result">
      <CheckCircle :size="16" />
      <span>Query executed. {{ result.changes }} row(s) affected.</span>
    </div>
  </div>
</template>

<style scoped>
.results { flex: 1; overflow: hidden; background: #fff; display: flex; flex-direction: column; }
.result-info {
  padding: 8px 16px;
  font-size: 12px;
  color: #6b7280;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.export-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 3px 10px; font-size: 11px;
  border: 1px solid #d1d5db; border-radius: 5px;
  background: #fff; color: #374151; cursor: pointer;
  font-weight: 500; transition: all 0.15s;
}
.export-btn:hover { background: #f3f4f6; }
.export-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.table-container { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
.table-scroll { flex: 1; overflow: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead { position: sticky; top: 0; z-index: 1; }
th {
  padding: 8px 14px;
  text-align: left;
  background: #f3f4f6;
  color: #374151;
  border-bottom: 2px solid #e5e7eb;
  font-weight: 600;
  white-space: nowrap;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
td {
  padding: 7px 14px;
  border-bottom: 1px solid #f3f4f6;
  color: #1f2937;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
tr:hover td { background: #eff6ff; }
.null-value { color: #9ca3af; font-style: italic; }
.empty { padding: 24px; color: #9ca3af; text-align: center; }
.modify-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: #16a34a;
  font-size: 14px;
}
</style>
