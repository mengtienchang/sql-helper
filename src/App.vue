<script setup lang="ts">
import { ref } from 'vue'
import { useTheme } from './composables/useTheme'
import {
  BarChart3, Table2, Search, Upload, Download, Settings, Sliders, MessageSquare, HelpCircle
} from 'lucide-vue-next'
import DashboardView from './components/DashboardView.vue'
import ChatPanel from './components/ChatPanel.vue'
import GuidedTour from './components/GuidedTour.vue'
import TablesView from './components/TablesView.vue'
import QueryView from './components/QueryView.vue'
import ImportView from './components/ImportView.vue'
import ManageView from './components/ManageView.vue'
import ExportView from './components/ExportView.vue'
import SettingsView from './components/SettingsView.vue'

useTheme()

type Page = 'dashboard' | 'tables' | 'query' | 'manage' | 'import' | 'export' | 'settings'

const currentPage = ref<Page>('dashboard')
const chatOpen = ref(false)
const tourVisible = ref(false)

import { onMounted } from 'vue'
onMounted(() => {
  if (!localStorage.getItem('tour_completed')) {
    setTimeout(() => { tourVisible.value = true }, 600)
  }
  window.menu?.onStartTour(() => { tourVisible.value = true })
})

function startTour() {
  tourVisible.value = true
}

function onTourClose() {
  tourVisible.value = false
  localStorage.setItem('tour_completed', '1')
}

const navItems: { id: Page; label: string; icon: any }[] = [
  { id: 'dashboard', label: '概覽', icon: BarChart3 },
  { id: 'tables', label: '資料表', icon: Table2 },
  { id: 'query', label: '查詢', icon: Search },
  { id: 'manage', label: '管理', icon: Sliders },
  { id: 'import', label: '匯入', icon: Upload },
  { id: 'export', label: '匯出', icon: Download },
  { id: 'settings', label: '設定', icon: Settings },
]
</script>

<template>
  <div class="app">
    <aside class="sidebar" data-tour="sidebar">
      <div class="brand">
        <div class="brand-icon"><BarChart3 :size="20" /></div>
        <span>智能財報助手</span>
      </div>

      <nav class="nav">
        <div class="nav-label">功能</div>
        <button
          v-for="item in navItems"
          :key="item.id"
          :class="['nav-item', { active: currentPage === item.id }]"
          :data-tour="item.id"
          @click="currentPage = item.id"
        >
          <component :is="item.icon" :size="18" />
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <button class="help-btn" @click="startTour" title="使用教程">
        <HelpCircle :size="16" />
        <span>使用教程</span>
      </button>
    </aside>

    <main class="main" data-tour="dashboard">
      <DashboardView v-if="currentPage === 'dashboard'" />
      <TablesView v-else-if="currentPage === 'tables'" />
      <QueryView v-else-if="currentPage === 'query'" />
      <ManageView v-else-if="currentPage === 'manage'" />
      <ImportView v-else-if="currentPage === 'import'" />
      <ExportView v-else-if="currentPage === 'export'" />
      <SettingsView v-else-if="currentPage === 'settings'" />
    </main>

    <ChatPanel v-if="chatOpen" @close="chatOpen = false" />

    <button v-if="!chatOpen" class="chat-fab" data-tour="chat-fab" @click="chatOpen = true">
      <MessageSquare :size="20" />
    </button>

    <GuidedTour v-if="tourVisible" @close="onTourClose" />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft JhengHei', sans-serif;
}

.sidebar {
  width: 220px;
  background: var(--sidebar-bg);
  color: var(--sidebar-text);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: background 0.3s;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 18px 16px;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}
.brand-icon {
  width: 32px;
  height: 32px;
  background: var(--accent-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}

.nav { flex: 1; padding: 8px 10px; }
.nav-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--sidebar-text);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 8px 10px 6px;
  opacity: 0.7;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  margin-bottom: 2px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--sidebar-text);
  cursor: pointer;
  font-size: 14px;
  text-align: left;
  transition: all 0.15s;
}
.nav-item:hover { background: var(--sidebar-active); color: #fff; }
.nav-item.active { background: var(--sidebar-active); color: #fff; font-weight: 500; }

.help-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 10px 14px;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--sidebar-text);
  opacity: 0.6;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
  transition: all 0.15s;
}
.help-btn:hover { opacity: 1; background: var(--sidebar-active); }

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--main-bg);
  transition: background 0.3s;
}

.chat-fab {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(37,99,235,0.4);
  transition: all 0.2s;
  z-index: 50;
}
.chat-fab:hover { background: #1d4ed8; transform: scale(1.05); }
</style>
