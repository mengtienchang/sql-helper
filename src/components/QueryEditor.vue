<script setup lang="ts">
import { ref } from 'vue'
import { Play } from 'lucide-vue-next'

defineProps<{ disabled: boolean }>()
const emit = defineEmits<{ execute: [sql: string] }>()

const sql = ref('SELECT 1;')

function run() {
  const trimmed = sql.value.trim()
  if (trimmed) emit('execute', trimmed)
}

function handleKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    run()
  }
}
</script>

<template>
  <div class="query-editor">
    <textarea
      v-model="sql"
      :disabled="disabled"
      placeholder="Enter SQL query..."
      @keydown="handleKeydown"
      rows="5"
    />
    <div class="editor-actions">
      <span class="hint">Ctrl + Enter</span>
      <button class="run-btn" @click="run" :disabled="disabled || !sql.trim()">
        <Play :size="14" />
        <span>Run</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.query-editor {
  padding: 12px 16px;
  background: #f8f9fa;
  border-bottom: 1px solid #e5e7eb;
}
textarea {
  width: 100%;
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 14px;
  padding: 10px 12px;
  background: #fff;
  color: #1a1a1a;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  resize: vertical;
  box-sizing: border-box;
  line-height: 1.5;
}
textarea:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15); }
.editor-actions {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
.hint { font-size: 12px; color: #9ca3af; }
.run-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.run-btn:hover { background: #1d4ed8; }
.run-btn:disabled { background: #93c5fd; cursor: not-allowed; opacity: 1; }
</style>
