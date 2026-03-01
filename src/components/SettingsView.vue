<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Check, Database, Eye, EyeOff } from 'lucide-vue-next'
import { useTheme } from '../composables/useTheme'

const { current, setTheme } = useTheme()
const seedMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null)
const seeding = ref(false)

const apiKey = ref('')
const showApiKey = ref(false)
const apiKeySaved = ref(false)

onMounted(async () => {
  const saved = await window.setting.get('deepseek_api_key')
  if (saved) apiKey.value = saved
})

async function saveApiKey() {
  await window.setting.set('deepseek_api_key', apiKey.value.trim())
  apiKeySaved.value = true
  setTimeout(() => { apiKeySaved.value = false }, 2000)
}

async function seedDatabase() {
  console.log('[seed] button clicked')
  seeding.value = true
  seedMessage.value = null
  try {
    const result = await window.db.seed()
    console.log('[seed] result:', result)
    seeding.value = false
    seedMessage.value = {
      type: result.success ? 'success' : 'error',
      text: result.message ?? '未知錯誤',
    }
  } catch (err) {
    console.error('[seed] error:', err)
    seeding.value = false
    seedMessage.value = { type: 'error', text: String(err) }
  }
}

const themes = [
  { id: 'dark',     name: '深色',   sidebar: '#111827', accent: '#2563eb' },
  { id: 'midnight', name: '午夜',   sidebar: '#0f172a', accent: '#6366f1' },
  { id: 'ocean',    name: '海洋',   sidebar: '#0c4a6e', accent: '#0284c7' },
  { id: 'forest',   name: '森林',   sidebar: '#14532d', accent: '#16a34a' },
  { id: 'wine',     name: '酒紅',   sidebar: '#4c0519', accent: '#e11d48' },
  { id: 'light',    name: '淺色',   sidebar: '#ffffff', accent: '#2563eb' },
]

const rowLimit = ref(200)
const numberFormat = ref<'default' | 'comma'>('comma')
const dateFormat = ref('YYYY-MM-DD')
</script>

<template>
  <div class="settings">
    <div class="page-header">
      <h2>設定</h2>
      <p class="subtitle">應用程式偏好設定</p>
    </div>

    <div class="settings-content">
      <!-- 外觀主題 -->
      <section class="setting-group">
        <h3>外觀主題</h3>
        <div class="theme-grid">
          <button
            v-for="t in themes"
            :key="t.id"
            :class="['theme-card', { active: current.current === t.id }]"
            @click="setTheme(t.id)"
          >
            <div class="theme-preview">
              <div class="preview-sidebar" :style="{ background: t.sidebar }">
                <div class="preview-dot" :style="{ background: t.accent }"></div>
                <div class="preview-line" :style="{ background: t.id === 'light' ? '#e5e7eb' : 'rgba(255,255,255,0.2)' }"></div>
                <div class="preview-line" :style="{ background: t.id === 'light' ? '#e5e7eb' : 'rgba(255,255,255,0.12)' }"></div>
              </div>
              <div class="preview-main">
                <div class="preview-bar"></div>
                <div class="preview-content"></div>
              </div>
            </div>
            <div class="theme-name">
              {{ t.name }}
              <Check v-if="current.current === t.id" :size="14" />
            </div>
          </button>
        </div>
      </section>

      <!-- 資料顯示 -->
      <section class="setting-group">
        <h3>資料顯示</h3>

        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">預設查詢筆數上限</div>
            <div class="setting-desc">資料表瀏覽及查詢時的預設 LIMIT 值</div>
          </div>
          <select v-model="rowLimit" class="setting-select">
            <option :value="50">50</option>
            <option :value="100">100</option>
            <option :value="200">200</option>
            <option :value="500">500</option>
            <option :value="1000">1000</option>
          </select>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">數字格式</div>
            <div class="setting-desc">財報數字的顯示方式</div>
          </div>
          <select v-model="numberFormat" class="setting-select">
            <option value="default">1234567</option>
            <option value="comma">1,234,567</option>
          </select>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">日期格式</div>
            <div class="setting-desc">日期欄位的顯示格式</div>
          </div>
          <select v-model="dateFormat" class="setting-select">
            <option value="YYYY-MM-DD">2024-01-15</option>
            <option value="YYYY/MM/DD">2024/01/15</option>
            <option value="MM/DD/YYYY">01/15/2024</option>
          </select>
        </div>
      </section>

      <!-- AI 助手 -->
      <section class="setting-group">
        <h3>AI 助手</h3>
        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">DeepSeek API Key</div>
            <div class="setting-desc">用於聊天助手的 AI 模型金鑰</div>
          </div>
        </div>
        <div class="api-key-row">
          <div class="api-key-input-wrap">
            <input
              :type="showApiKey ? 'text' : 'password'"
              v-model="apiKey"
              placeholder="sk-..."
              class="api-key-input"
              @keydown.enter="saveApiKey"
            />
            <button class="toggle-vis" @click="showApiKey = !showApiKey" type="button">
              <EyeOff v-if="showApiKey" :size="14" />
              <Eye v-else :size="14" />
            </button>
          </div>
          <button class="save-btn" @click="saveApiKey">
            {{ apiKeySaved ? '已儲存 ✓' : '儲存' }}
          </button>
        </div>
      </section>

      <!-- 開發工具 -->
      <section class="setting-group">
        <h3>開發工具</h3>
        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">產生範例數據</div>
            <div class="setting-desc">建立 3 個廠區 × 8 個季度的測試數據</div>
          </div>
          <button class="seed-btn" @click="seedDatabase" :disabled="seeding">
            <Database :size="14" />
            <span>{{ seeding ? '產生中...' : '產生數據' }}</span>
          </button>
        </div>
        <div v-if="seedMessage" :class="['seed-message', seedMessage.type]">
          {{ seedMessage.text }}
        </div>
      </section>

      <!-- 關於 -->
      <section class="setting-group">
        <h3>關於</h3>
        <div class="about-card">
          <div class="about-row">
            <span class="about-label">應用程式</span>
            <span class="about-value">智能財報助手</span>
          </div>
          <div class="about-row">
            <span class="about-label">版本</span>
            <span class="about-value">0.1.0</span>
          </div>
          <div class="about-row">
            <span class="about-label">資料庫引擎</span>
            <span class="about-value">SQLite (sql.js)</span>
          </div>
          <div class="about-row">
            <span class="about-label">前端框架</span>
            <span class="about-value">Vue 3 + TypeScript</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings { flex: 1; overflow-y: auto; padding: 24px 28px; }
.page-header { margin-bottom: 24px; }
.page-header h2 { font-size: 22px; font-weight: 700; color: #111827; margin: 0; }
.subtitle { font-size: 14px; color: #6b7280; margin-top: 4px; }

.settings-content { max-width: 600px; }

.setting-group { margin-bottom: 28px; }
.setting-group h3 {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin: 0 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e5e7eb;
}

/* Theme grid */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.theme-card {
  border: 2px solid #e5e7eb;
  border-radius: 10px;
  padding: 0;
  background: #fff;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.15s;
}
.theme-card:hover { border-color: #9ca3af; }
.theme-card.active { border-color: var(--accent-color, #2563eb); box-shadow: 0 0 0 2px rgba(37,99,235,0.2); }

.theme-preview {
  display: flex;
  height: 56px;
  border-bottom: 1px solid #f3f4f6;
}
.preview-sidebar {
  width: 26px;
  padding: 6px 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}
.preview-dot { width: 10px; height: 10px; border-radius: 3px; }
.preview-line { width: 14px; height: 3px; border-radius: 2px; }
.preview-main { flex: 1; padding: 6px; background: #f9fafb; }
.preview-bar { height: 4px; width: 60%; background: #e5e7eb; border-radius: 2px; margin-bottom: 5px; }
.preview-content { height: 18px; background: #fff; border-radius: 3px; border: 1px solid #f3f4f6; }

.theme-name {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 7px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}
.theme-card.active .theme-name { color: var(--accent-color, #2563eb); }

/* Settings items */
.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #f3f4f6;
}
.setting-info { flex: 1; }
.setting-label { font-size: 14px; color: #111827; font-weight: 500; }
.setting-desc { font-size: 12px; color: #9ca3af; margin-top: 2px; }

.setting-select {
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #374151;
  font-size: 13px;
  cursor: pointer;
  min-width: 140px;
}
.setting-select:focus { outline: none; border-color: #2563eb; }

.about-card {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 4px 0;
}
.about-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 16px;
}
.about-row:not(:last-child) { border-bottom: 1px solid #f3f4f6; }
.about-label { font-size: 13px; color: #6b7280; }
.about-value { font-size: 13px; color: #111827; font-weight: 500; }

.api-key-row {
  display: flex; align-items: center; gap: 8px;
  margin-top: 8px;
}
.api-key-input-wrap {
  flex: 1; position: relative;
}
.api-key-input {
  width: 100%; padding: 8px 36px 8px 12px;
  border: 1px solid #d1d5db; border-radius: 6px;
  font-size: 13px; color: #111827; background: #fff;
  font-family: 'SF Mono', 'Fira Code', monospace;
  box-sizing: border-box;
}
.api-key-input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.1); }
.api-key-input::placeholder { font-family: inherit; color: #9ca3af; }
.toggle-vis {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  border: none; background: none; color: #9ca3af; cursor: pointer; padding: 2px;
}
.toggle-vis:hover { color: #6b7280; }
.save-btn {
  padding: 8px 16px; border: none; border-radius: 6px;
  background: #2563eb; color: #fff; font-size: 13px;
  cursor: pointer; white-space: nowrap; min-width: 72px;
}
.save-btn:hover { background: #1d4ed8; }

.seed-btn {
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
.seed-btn:hover { background: #f3f4f6; }
.seed-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.seed-message {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}
.seed-message.success { background: #f0fdf4; color: #16a34a; }
.seed-message.error { background: #fef2f2; color: #dc2626; }
</style>
