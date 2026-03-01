<script setup lang="ts">
import { ref } from 'vue'
import { Gauge, BarChart3, LayoutDashboard } from 'lucide-vue-next'
import MetricList from './MetricList.vue'
import ChartList from './ChartList.vue'
import DashboardList from './DashboardList.vue'

const activeTab = ref<'dashboards' | 'charts' | 'metrics'>('dashboards')
</script>

<template>
  <div class="manage-view">
    <div class="page-header">
      <h2>管理</h2>
      <p class="subtitle">管理儀表板、圖表與統計指標</p>
    </div>

    <div class="tab-bar">
      <button :class="['tab', { active: activeTab === 'dashboards' }]" @click="activeTab = 'dashboards'">
        <LayoutDashboard :size="14" />
        <span>儀表板</span>
      </button>
      <button :class="['tab', { active: activeTab === 'charts' }]" @click="activeTab = 'charts'">
        <BarChart3 :size="14" />
        <span>圖表</span>
      </button>
      <button :class="['tab', { active: activeTab === 'metrics' }]" @click="activeTab = 'metrics'">
        <Gauge :size="14" />
        <span>統計指標</span>
      </button>
    </div>

    <div class="tab-content">
      <DashboardList v-if="activeTab === 'dashboards'" />
      <ChartList v-else-if="activeTab === 'charts'" />
      <MetricList v-else />
    </div>
  </div>
</template>

<style scoped>
.manage-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.page-header { padding: 24px 28px 16px; }
.page-header h2 { font-size: 22px; font-weight: 700; color: #111827; margin: 0; }
.subtitle { font-size: 14px; color: #6b7280; margin-top: 4px; }

.tab-bar {
  display: flex; gap: 4px; padding: 0 28px;
  border-bottom: 1px solid #e5e7eb;
}
.tab {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; border: none;
  border-bottom: 2px solid transparent;
  background: transparent; color: #6b7280;
  cursor: pointer; font-size: 13px; white-space: nowrap;
  transition: all 0.15s;
}
.tab:hover { color: #374151; }
.tab.active { color: #2563eb; border-bottom-color: #2563eb; font-weight: 500; }

.tab-content { flex: 1; overflow-y: auto; padding: 20px 28px; }
</style>
