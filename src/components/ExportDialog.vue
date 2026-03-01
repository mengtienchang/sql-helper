<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { X, Download, Loader2 } from 'lucide-vue-next'

const props = defineProps<{ templateId: number; templateName: string }>()
const emit = defineEmits<{ close: []; done: [] }>()

const vars = ref<{ name: string; value: string }[]>([])
const loading = ref(true)
const generating = ref(false)
const error = ref('')

onMounted(async () => {
  try {
    const names = await window.export.scanVars(props.templateId)
    vars.value = names.map(n => ({ name: n, value: '' }))
  } catch (e) {
    error.value = String(e)
  }
  loading.value = false
})

async function generate() {
  generating.value = true
  error.value = ''
  try {
    const varMap: Record<string, string> = {}
    for (const v of vars.value) {
      varMap[v.name] = v.value
    }
    const res = await window.export.generate(props.templateId, varMap)
    if (res.success) {
      emit('done')
    } else {
      error.value = res.message || '匯出失敗'
    }
  } catch (e) {
    error.value = String(e)
  }
  generating.value = false
}
</script>

<template>
  <div class="dialog-overlay" @click.self="emit('close')">
    <div class="dialog">
      <div class="dialog-header">
        <h3>匯出：{{ templateName }}</h3>
        <button class="icon-btn" @click="emit('close')"><X :size="18" /></button>
      </div>

      <div class="dialog-body">
        <div v-if="loading" class="loading">
          <Loader2 :size="20" class="spin" />
          <span>載入中...</span>
        </div>

        <template v-else>
          <div v-if="vars.length === 0" class="no-vars">
            此模板無需填入變數，點擊匯出即可生成檔案。
          </div>

          <div v-else>
            <p class="vars-hint">請填入以下模板變數：</p>
            <div v-for="v in vars" :key="v.name" class="var-field">
              <label>{{ v.name }}</label>
              <input v-model="v.value" :placeholder="`請輸入 ${v.name}`" />
            </div>
          </div>

          <div v-if="error" class="error-msg">{{ error }}</div>
        </template>
      </div>

      <div class="dialog-footer">
        <button class="cancel-btn" @click="emit('close')">取消</button>
        <button class="export-btn" @click="generate" :disabled="generating || loading">
          <Download :size="14" />
          <span>{{ generating ? '生成中...' : '匯出' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.3);
  z-index: 100; display: flex; align-items: center; justify-content: center;
}
.dialog {
  background: #fff; border-radius: 12px; width: 440px; max-height: 80vh;
  box-shadow: 0 8px 30px rgba(0,0,0,0.15); display: flex; flex-direction: column;
}
.dialog-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid #e5e7eb;
}
.dialog-header h3 { font-size: 16px; font-weight: 600; color: #111827; margin: 0; }
.icon-btn { border: none; background: none; color: #6b7280; cursor: pointer; padding: 4px; border-radius: 4px; }
.icon-btn:hover { background: #f3f4f6; }

.dialog-body { flex: 1; overflow-y: auto; padding: 20px; }

.loading {
  display: flex; align-items: center; gap: 8px;
  color: #6b7280; font-size: 14px; justify-content: center; padding: 20px 0;
}
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.no-vars { color: #6b7280; font-size: 14px; text-align: center; padding: 12px 0; }
.vars-hint { font-size: 13px; color: #374151; margin: 0 0 12px; }

.var-field { margin-bottom: 12px; }
.var-field label {
  display: block; font-size: 13px; font-weight: 500;
  color: #374151; margin-bottom: 4px;
}
.var-field input {
  width: 100%; padding: 8px 12px; border: 1px solid #d1d5db;
  border-radius: 6px; font-size: 13px; color: #111827; box-sizing: border-box;
}
.var-field input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.1); }

.error-msg {
  margin-top: 12px; padding: 8px 12px; border-radius: 6px;
  font-size: 13px; background: #fef2f2; color: #dc2626;
}

.dialog-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 14px 20px; border-top: 1px solid #e5e7eb;
}
.cancel-btn {
  padding: 8px 16px; font-size: 13px; border: 1px solid #d1d5db;
  border-radius: 6px; background: #fff; color: #374151; cursor: pointer;
}
.cancel-btn:hover { background: #f3f4f6; }
.export-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 16px; font-size: 13px; border: none; border-radius: 6px;
  background: #2563eb; color: #fff; cursor: pointer;
}
.export-btn:hover { background: #1d4ed8; }
.export-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
