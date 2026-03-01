<script setup lang="ts">
import { ref } from 'vue'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-vue-next'

const dragOver = ref(false)
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null)

function handleDrop(event: DragEvent) {
  dragOver.value = false
  // Future: handle file drop
  message.value = { type: 'error', text: '檔案匯入功能開發中，敬請期待' }
}
</script>

<template>
  <div class="import-view">
    <div class="page-header">
      <h2>匯入資料</h2>
      <p class="subtitle">從 CSV / Excel 檔案匯入財報數據</p>
    </div>

    <div class="import-content">
      <div
        class="drop-zone"
        :class="{ 'drag-over': dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="handleDrop"
      >
        <FileSpreadsheet :size="40" stroke-width="1.2" />
        <p class="drop-title">拖曳檔案到這裡</p>
        <p class="drop-hint">支援 .csv 和 .xlsx 格式</p>
        <button class="browse-btn" @click="message = { type: 'error', text: '檔案匯入功能開發中，敬請期待' }">
          <Upload :size="14" />
          <span>選擇檔案</span>
        </button>
      </div>

      <div v-if="message" :class="['message', message.type]">
        <CheckCircle v-if="message.type === 'success'" :size="15" />
        <AlertCircle v-else :size="15" />
        <span>{{ message.text }}</span>
      </div>

      <div class="import-tips">
        <h3>匯入說明</h3>
        <ul>
          <li>CSV 檔案：第一列作為欄位名稱</li>
          <li>Excel 檔案：讀取第一個工作表</li>
          <li>系統會自動偵測資料型別</li>
          <li>重複匯入相同檔案會覆蓋原有資料</li>
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

.import-content { max-width: 560px; }

.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  border: 2px dashed #d1d5db;
  border-radius: 12px;
  background: #f9fafb;
  color: #6b7280;
  transition: all 0.2s;
  cursor: pointer;
}
.drop-zone.drag-over { border-color: #2563eb; background: #eff6ff; }
.drop-title { font-size: 16px; font-weight: 600; color: #374151; margin: 4px 0 0; }
.drop-hint { font-size: 13px; color: #9ca3af; }
.browse-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 8px 20px;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.browse-btn:hover { background: #1d4ed8; }

.message {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
}
.message.success { background: #f0fdf4; color: #16a34a; }
.message.error { background: #fef2f2; color: #dc2626; }

.import-tips {
  margin-top: 24px;
  padding: 16px 20px;
  background: #f9fafb;
  border-radius: 8px;
}
.import-tips h3 { font-size: 14px; font-weight: 600; color: #374151; margin: 0 0 10px; }
.import-tips ul { margin: 0; padding-left: 20px; }
.import-tips li { font-size: 13px; color: #6b7280; line-height: 1.8; }
</style>
