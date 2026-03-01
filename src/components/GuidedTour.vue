<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'

const emit = defineEmits<{ close: [] }>()

interface Step {
  target: string
  title: string
  description: string
  position: 'top' | 'bottom' | 'left' | 'right'
}

const steps: Step[] = [
  { target: '[data-tour="sidebar"]', title: '功能選單', description: '左側選單可切換不同功能頁面，包括概覽、資料表、查詢、管理等。', position: 'right' },
  { target: '[data-tour="dashboard"]', title: '概覽儀表板', description: '顯示 KPI 卡片、圖表和統計指標，一眼掌握財務狀況。', position: 'left' },
  { target: '[data-tour="dashboard-switcher"]', title: '切換儀表板', description: '下拉選單切換不同主題的儀表板，例如獲利分析、成本分析等。', position: 'bottom' },
  { target: '[data-tour="manage"]', title: '管理功能', description: '自訂儀表板佈局、新增圖表和統計指標，打造你的專屬報表。', position: 'right' },
  { target: '[data-tour="query"]', title: 'SQL 查詢', description: '直接撰寫 SQL 語句查詢財報數據，支援即時預覽結果。', position: 'right' },
  { target: '[data-tour="export"]', title: '匯出模板', description: '上傳 Excel 模板，用佔位符自動填入資料庫數據並匯出。', position: 'right' },
  { target: '[data-tour="chat-fab"]', title: 'AI 助手', description: '用自然語言問問題，AI 會自動生成 SQL 查詢並回傳結果。', position: 'left' },
  { target: '[data-tour="settings"]', title: '設定', description: '調整外觀主題、設定 API 金鑰、產生範例數據等。', position: 'right' },
]

const currentStep = ref(0)
const highlight = ref({ top: 0, left: 0, width: 0, height: 0 })
const tooltip = ref({ top: 0, left: 0 })
const ready = ref(false)

// 過濾掉找不到的步驟
const activeSteps = ref<Step[]>([])

function buildActiveSteps() {
  activeSteps.value = steps.filter(s => document.querySelector(s.target))
}

const step = computed(() => activeSteps.value[currentStep.value])
const isLast = computed(() => currentStep.value >= activeSteps.value.length - 1)

// 追蹤當前被提升 z-index 的元素，切換時還原
let elevatedEl: HTMLElement | null = null

function clearElevation() {
  if (elevatedEl) {
    elevatedEl.style.removeProperty('z-index')
    elevatedEl.style.removeProperty('position')
    elevatedEl = null
  }
}

function updatePosition() {
  if (!step.value) return
  const el = document.querySelector(step.value.target) as HTMLElement | null
  if (!el) return

  // 還原前一個元素，提升當前元素
  clearElevation()
  const cs = getComputedStyle(el)
  if (cs.position === 'static') {
    el.style.position = 'relative'
  }
  el.style.zIndex = '9998'
  elevatedEl = el

  const rect = el.getBoundingClientRect()
  const pad = 6

  highlight.value = {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  }

  const tooltipW = 320
  const tooltipH = 160
  const gap = 16

  const vh = window.innerHeight

  switch (step.value.position) {
    case 'right':
      tooltip.value = {
        top: Math.min(Math.max(8, rect.top), vh - tooltipH - 8),
        left: rect.right + gap,
      }
      break
    case 'left':
      tooltip.value = {
        top: Math.min(Math.max(8, rect.top), vh - tooltipH - 8),
        left: Math.max(8, rect.left - tooltipW - gap),
      }
      break
    case 'bottom':
      tooltip.value = {
        top: rect.bottom + gap,
        left: Math.max(8, rect.left + rect.width / 2 - tooltipW / 2),
      }
      break
    case 'top':
      tooltip.value = {
        top: Math.max(8, rect.top - tooltipH - gap),
        left: Math.max(8, rect.left + rect.width / 2 - tooltipW / 2),
      }
      break
  }
}

function next() {
  if (isLast.value) {
    emit('close')
  } else {
    currentStep.value++
  }
}

function prev() {
  if (currentStep.value > 0) currentStep.value--
}

function skip() {
  emit('close')
}

watch(currentStep, () => {
  nextTick(updatePosition)
})

let resizeHandler: () => void

onMounted(() => {
  buildActiveSteps()
  if (activeSteps.value.length === 0) {
    emit('close')
    return
  }
  nextTick(() => {
    updatePosition()
    ready.value = true
  })
  resizeHandler = () => updatePosition()
  window.addEventListener('resize', resizeHandler)
})

onUnmounted(() => {
  clearElevation()
  if (resizeHandler) window.removeEventListener('resize', resizeHandler)
})

const highlightStyle = computed(() => ({
  top: highlight.value.top + 'px',
  left: highlight.value.left + 'px',
  width: highlight.value.width + 'px',
  height: highlight.value.height + 'px',
}))

const tooltipStyle = computed(() => ({
  top: tooltip.value.top + 'px',
  left: tooltip.value.left + 'px',
}))
</script>

<template>
  <Teleport to="body">
    <div v-if="ready && step" class="tour-wrapper">
      <!-- Highlight with box-shadow overlay -->
      <div class="tour-highlight" :style="highlightStyle"></div>

      <!-- Tooltip -->
      <div class="tour-tooltip" :style="tooltipStyle">
        <div class="tour-step-num">{{ currentStep + 1 }} / {{ activeSteps.length }}</div>
        <h4 class="tour-title">{{ step.title }}</h4>
        <p class="tour-desc">{{ step.description }}</p>
        <div class="tour-footer">
          <button class="tour-skip" @click="skip">跳過</button>
          <div class="tour-nav">
            <button v-if="currentStep > 0" class="tour-btn" @click="prev">上一步</button>
            <button class="tour-btn primary" @click="next">
              {{ isLast ? '完成' : '下一步' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tour-wrapper {
  position: fixed;
  inset: 0;
  z-index: 9997;
  pointer-events: none;
}

.tour-highlight {
  position: fixed;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
  border-radius: 8px;
  z-index: 9998;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

.tour-tooltip {
  position: fixed;
  z-index: 9999;
  width: 320px;
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
  pointer-events: auto;
  transition: top 0.35s cubic-bezier(0.4, 0, 0.2, 1),
              left 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.tour-step-num {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  margin-bottom: 6px;
  letter-spacing: 0.05em;
}

.tour-title {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 8px;
}

.tour-desc {
  font-size: 13px;
  line-height: 1.6;
  color: #6b7280;
  margin: 0 0 16px;
}

.tour-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tour-skip {
  border: none;
  background: none;
  color: #9ca3af;
  font-size: 13px;
  cursor: pointer;
  padding: 4px 0;
}
.tour-skip:hover { color: #6b7280; }

.tour-nav {
  display: flex;
  gap: 8px;
}

.tour-btn {
  padding: 7px 16px;
  font-size: 13px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  color: #374151;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.15s;
}
.tour-btn:hover { background: #f3f4f6; }
.tour-btn.primary {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}
.tour-btn.primary:hover { background: #1d4ed8; }
</style>
