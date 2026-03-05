<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart, PieChart as EPieChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent, GridComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'
import {
  TrendingUp, TrendingDown, DollarSign, BarChart3,
  PieChart, Activity, LayoutDashboard, Lightbulb, Target,
  Filter, Calendar, Factory,
} from 'lucide-vue-next'
import { buildChartOption } from '../composables/useChartRenderer'

use([
  CanvasRenderer, LineChart, BarChart, EPieChart,
  TitleComponent, TooltipComponent, LegendComponent, GridComponent,
])

interface KPI {
  label: string; value: string; trend?: string; up?: boolean; icon: string
}
interface DashboardDef {
  id: number; name: string; description: string; analysis: string; actions: string
}
interface RenderItem {
  key: string
  type: 'chart' | 'metric'
  name: string
  colSpan: number
  chartOption?: any
  metricCategory?: string
  metricValue?: string
  metricUnit?: string
  metricDescription?: string
  metricStatus?: 'good' | 'warn' | 'bad' | null
}

const kpis = ref<KPI[]>([])
const hasData = ref(false)
const dashboards = ref<DashboardDef[]>([])
const activeDashboardId = ref<number | null>(null)
const activeDashboard = ref<DashboardDef | null>(null)
const renderItems = ref<RenderItem[]>([])
const loading = ref(false)

// ── Filters ──
const filterPeriod = ref<string>('')       // '' = all
const filterFactoryId = ref<number>(0)     // 0 = all
const availablePeriods = ref<string[]>([])
const availableFactories = ref<{ id: number; name: string }[]>([])

function fmt(n: number): string {
  return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
}

function computeStatus(value: number, thresholdsJson: string): 'good' | 'warn' | 'bad' | null {
  if (!thresholdsJson) return null
  try {
    const t = JSON.parse(thresholdsJson)
    if (value >= t.good.min) return 'good'
    if (value >= t.warn.min) return 'warn'
    return 'bad'
  } catch { return null }
}

const statusLabels: Record<string, string> = { good: '良好', warn: '注意', bad: '異常' }

// ── Filter logic ──
// Replaces `financial_report` with a filtered subquery inline
// This works both at top-level and inside subqueries (unlike CTE approach)
function applyFilters(sql: string): string {
  const conditions: string[] = []
  if (filterPeriod.value) conditions.push(`period='${filterPeriod.value.replace(/'/g, "''")}'`)
  if (filterFactoryId.value) conditions.push(`factory_id=${Number(filterFactoryId.value)}`)
  if (conditions.length === 0) return sql
  const where = conditions.join(' AND ')
  return sql.replace(/\bfinancial_report\b/g, `(SELECT * FROM financial_report WHERE ${where})`)
}

function buildKpiWhere(): { where: string; params: unknown[] } {
  const conds: string[] = []
  const params: unknown[] = []
  if (filterPeriod.value) { conds.push('period = ?'); params.push(filterPeriod.value) }
  if (filterFactoryId.value) { conds.push('factory_id = ?'); params.push(filterFactoryId.value) }
  return { where: conds.length ? ' AND ' + conds.join(' AND ') : '', params }
}

async function loadFilterOptions() {
  const pRes = await window.db.execute('SELECT DISTINCT period FROM financial_report ORDER BY period')
  if (pRes.success && pRes.rows) {
    availablePeriods.value = pRes.rows.map(r => r.period as string)
  }
  const fRes = await window.db.execute('SELECT id, name FROM factory ORDER BY id')
  if (fRes.success && fRes.rows) {
    availableFactories.value = fRes.rows.map(r => ({ id: r.id as number, name: r.name as string }))
  }
}

onMounted(async () => {
  await loadFilterOptions()
  await loadKPIs()
  await loadDashboards()
})

watch(activeDashboardId, (id) => {
  if (id !== null) loadDashboardItems(id)
  activeDashboard.value = dashboards.value.find(d => d.id === id) ?? null
})

// Re-load when filters change
watch([filterPeriod, filterFactoryId], () => {
  loadKPIs()
  if (activeDashboardId.value !== null) loadDashboardItems(activeDashboardId.value)
})

async function loadKPIs() {
  try {
    const periodsRes = await window.db.execute(
      `SELECT DISTINCT period FROM financial_report ORDER BY period`
    )
    if (!periodsRes.success || !periodsRes.rows?.length) return
    const allPeriods = periodsRes.rows.map(r => r.period as string)
    hasData.value = true

    const { where: filterWhere, params: filterParams } = buildKpiWhere()

    // If period is filtered, use that; otherwise use latest
    const targetPeriod = filterPeriod.value || allPeriods[allPeriods.length - 1]
    const prevIdx = allPeriods.indexOf(targetPeriod) - 1
    const prevPeriod = prevIdx >= 0 ? allPeriods[prevIdx] : null

    const curRes = await window.db.execute(
      `SELECT SUM(財報營收) as revenue, SUM(淨利潤) as profit, SUM(營業毛利) as gross_profit FROM financial_report WHERE period = ?${filterFactoryId.value ? ' AND factory_id = ?' : ''}`,
      filterFactoryId.value ? [targetPeriod, filterFactoryId.value] : [targetPeriod]
    )
    if (!curRes.success || !curRes.rows?.length) return
    const cur = curRes.rows[0] as any
    const revenue = cur.revenue ?? 0
    const profit = cur.profit ?? 0
    const grossMargin = revenue ? (cur.gross_profit / revenue * 100) : 0

    let revTrend = targetPeriod, profitTrend = targetPeriod, marginTrend = targetPeriod
    let revUp = true, profitUp = true, marginUp = true

    if (prevPeriod) {
      const prevRes = await window.db.execute(
        `SELECT SUM(財報營收) as revenue, SUM(淨利潤) as profit, SUM(營業毛利) as gross_profit FROM financial_report WHERE period = ?${filterFactoryId.value ? ' AND factory_id = ?' : ''}`,
        filterFactoryId.value ? [prevPeriod, filterFactoryId.value] : [prevPeriod]
      )
      if (prevRes.success && prevRes.rows?.length) {
        const prev = prevRes.rows[0] as any
        if (prev.revenue) {
          const rd = ((revenue - prev.revenue) / prev.revenue * 100)
          revTrend = `${rd >= 0 ? '+' : ''}${rd.toFixed(1)}% vs ${prevPeriod}`; revUp = rd >= 0
        }
        if (prev.profit) {
          const pd = ((profit - prev.profit) / prev.profit * 100)
          profitTrend = `${pd >= 0 ? '+' : ''}${pd.toFixed(1)}% vs ${prevPeriod}`; profitUp = pd >= 0
        }
        const prevMargin = prev.revenue ? (prev.gross_profit / prev.revenue * 100) : 0
        const md = grossMargin - prevMargin
        marginTrend = `${md >= 0 ? '+' : ''}${md.toFixed(2)}pp vs ${prevPeriod}`; marginUp = md >= 0
      }
    }

    const factoryLabel = filterFactoryId.value
      ? availableFactories.value.find(f => f.id === filterFactoryId.value)?.name || ''
      : ''
    const factoryRes = await window.db.execute(`SELECT COUNT(*) as cnt FROM factory`)
    const factoryCount = factoryRes.success && factoryRes.rows?.length ? (factoryRes.rows[0] as any).cnt : 0

    kpis.value = [
      { label: '營業收入', value: fmt(revenue), trend: revTrend, up: revUp, icon: 'revenue' },
      { label: '淨利潤', value: fmt(profit), trend: profitTrend, up: profitUp, icon: 'profit' },
      { label: '毛利率', value: grossMargin.toFixed(2) + '%', trend: marginTrend, up: marginUp, icon: 'margin' },
      { label: factoryLabel || '廠區數', value: factoryLabel ? targetPeriod : String(factoryCount), trend: factoryLabel ? factoryLabel : `共 ${allPeriods.length} 個季度`, icon: 'tables' },
    ]
  } catch (err) {
    console.error('[dashboard] KPI error:', err)
  }
}

async function loadDashboards() {
  const res = await window.db.execute('SELECT id, name, description, analysis, actions FROM dashboard ORDER BY sort_order, id')
  if (res.success && res.rows?.length) {
    dashboards.value = res.rows.map((r: any) => ({
      id: r.id, name: r.name, description: r.description || '',
      analysis: r.analysis || '', actions: r.actions || '',
    }))
    activeDashboardId.value = dashboards.value[0].id
  }
}

async function loadDashboardItems(dashboardId: number) {
  loading.value = true
  renderItems.value = []
  try {
    const itemsRes = await window.db.execute(
      `SELECT di.item_type, di.item_id, di.col_span FROM dashboard_item di WHERE di.dashboard_id=? ORDER BY di.sort_order`,
      [dashboardId]
    )
    if (!itemsRes.success || !itemsRes.rows?.length) { loading.value = false; return }

    // For metrics: determine which period to use
    let metricPeriod: string | null = null
    if (filterPeriod.value) {
      metricPeriod = filterPeriod.value
    } else {
      const periodRes = await window.db.execute('SELECT MAX(period) as p FROM financial_report')
      metricPeriod = periodRes.success && periodRes.rows?.length ? (periodRes.rows[0] as any).p : null
    }

    const items: RenderItem[] = []
    for (const row of itemsRes.rows) {
      const itemType = row.item_type as 'chart' | 'metric'
      const itemId = row.item_id as number
      const colSpan = row.col_span as number

      if (itemType === 'chart') {
        const chartRes = await window.db.execute('SELECT * FROM chart WHERE id=?', [itemId])
        if (chartRes.success && chartRes.rows?.length) {
          const c = chartRes.rows[0] as any
          try {
            const filteredSql = applyFilters(c.sql)
            const dataRes = await window.db.execute(filteredSql)
            if (dataRes.success && dataRes.rows?.length) {
              const option = buildChartOption(
                dataRes.rows, c.chart_type, c.x_column, JSON.parse(c.series_columns),
                { yFormatter: c.y_formatter, stack: !!c.stack },
              )
              if (option) {
                items.push({ key: `chart-${itemId}`, type: 'chart', name: c.title || c.name, colSpan, chartOption: option })
              }
            }
          } catch (e) { console.error(`[dashboard] chart ${c.name}:`, e) }
        }
      } else {
        const metricRes = await window.db.execute('SELECT * FROM metric WHERE id=?', [itemId])
        if (metricRes.success && metricRes.rows?.length) {
          const m = metricRes.rows[0] as any
          try {
            // Apply factory filter to metric SQL, then wrap with period filter
            const filteredMetricSql = applyFilters(m.sql)
            const wrapped = `SELECT ROUND(SUM(sub.value), 2) as total FROM (${filteredMetricSql}) sub WHERE sub.period = ?`
            const mRes = await window.db.execute(wrapped, [metricPeriod])
            if (mRes.success && mRes.rows?.length) {
              const rawValue = (mRes.rows[0] as any).total ?? 0
              const unit = m.unit || ''
              const displayValue = unit === '%' ? rawValue.toFixed(2) + unit : fmt(rawValue) + (unit ? ' ' + unit : '')
              items.push({
                key: `metric-${itemId}`, type: 'metric', name: m.name, colSpan,
                metricCategory: m.category, metricValue: displayValue,
                metricUnit: unit, metricDescription: m.description || '',
                metricStatus: computeStatus(rawValue, m.thresholds || ''),
              })
            }
          } catch (e) { console.error(`[dashboard] metric ${m.name}:`, e) }
        }
      }
    }
    renderItems.value = items
  } catch (err) { console.error('[dashboard] items:', err) }
  loading.value = false
}

const iconMap: Record<string, any> = {
  revenue: DollarSign, profit: Activity, margin: PieChart, tables: BarChart3,
}
</script>

<template>
  <div class="dashboard">
    <div class="page-header">
      <div>
        <h2>概覽</h2>
        <p class="subtitle">財務數據總覽</p>
      </div>
      <div v-if="dashboards.length > 0" class="dashboard-switcher" data-tour="dashboard-switcher">
        <LayoutDashboard :size="14" />
        <select v-model="activeDashboardId">
          <option v-for="d in dashboards" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
      </div>
    </div>

    <div v-if="!hasData" class="empty-state">
      <BarChart3 :size="48" stroke-width="1" />
      <p>尚無資料，請先到設定頁產生範例數據</p>
    </div>

    <div v-else class="dashboard-content">
      <!-- Filter bar -->
      <div class="filter-bar">
        <Filter :size="14" class="filter-icon" />
        <div class="filter-group">
          <Calendar :size="13" />
          <select v-model="filterPeriod">
            <option value="">全部期間</option>
            <option v-for="p in availablePeriods" :key="p" :value="p">{{ p }}</option>
          </select>
        </div>
        <div class="filter-group">
          <Factory :size="13" />
          <select v-model.number="filterFactoryId">
            <option :value="0">全部廠區</option>
            <option v-for="f in availableFactories" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </div>
        <button v-if="filterPeriod || filterFactoryId" class="clear-filter" @click="filterPeriod = ''; filterFactoryId = 0">
          清除篩選
        </button>
      </div>

      <!-- KPI -->
      <div class="kpi-grid">
        <div v-for="kpi in kpis" :key="kpi.label" class="kpi-card">
          <div :class="['kpi-icon', kpi.icon]">
            <component :is="iconMap[kpi.icon]" :size="20" />
          </div>
          <div class="kpi-body">
            <div class="kpi-label">{{ kpi.label }}</div>
            <div class="kpi-value">{{ kpi.value }}</div>
            <div :class="['kpi-trend', { up: kpi.up === true, down: kpi.up === false }]">
              <TrendingUp v-if="kpi.up === true" :size="14" />
              <TrendingDown v-if="kpi.up === false" :size="14" />
              <span>{{ kpi.trend }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Dashboard description -->
      <div v-if="activeDashboard?.description" class="dashboard-desc">
        {{ activeDashboard.description }}
      </div>

      <!-- Dashboard items -->
      <div v-if="loading" class="loading-hint">載入中...</div>

      <div v-else-if="renderItems.length === 0" class="empty-dashboard">
        <LayoutDashboard :size="36" stroke-width="1" />
        <p>{{ dashboards.length ? '此儀表板尚無內容，到管理頁編輯' : '尚無儀表板，到管理頁新增' }}</p>
      </div>

      <template v-else>
        <!-- Charts section -->
        <div class="items-grid">
          <div
            v-for="item in renderItems"
            :key="item.key"
            :class="['grid-item', { full: item.colSpan === 2 }]"
          >
            <div v-if="item.type === 'chart'" class="chart-card">
              <h3>{{ item.name }}</h3>
              <VChart :option="item.chartOption" class="chart" autoresize />
            </div>
            <div v-else class="metric-card">
              <div class="metric-header">
                <div class="metric-category">{{ item.metricCategory }}</div>
                <div v-if="item.metricStatus" :class="['status-dot', item.metricStatus]" :title="statusLabels[item.metricStatus]"></div>
              </div>
              <div class="metric-name">{{ item.name }}</div>
              <div class="metric-value-row">
                <span class="metric-value" :class="item.metricStatus">{{ item.metricValue }}</span>
                <span v-if="item.metricStatus" :class="['status-label', item.metricStatus]">{{ statusLabels[item.metricStatus] }}</span>
              </div>
              <!-- Popover -->
              <div v-if="item.metricDescription" class="metric-popover">
                <div class="popover-content">
                  <div class="popover-title">{{ item.name }}</div>
                  <div class="popover-desc">{{ item.metricDescription }}</div>
                  <div v-if="item.metricStatus" class="popover-status">
                    目前狀態：<span :class="['popover-status-text', item.metricStatus]">{{ statusLabels[item.metricStatus] }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Story section: analysis + actions (暫時隱藏，待接入 AI 後啟用) -->
        <!-- <div v-if="activeDashboard?.analysis || activeDashboard?.actions" class="story-section">
          <div v-if="activeDashboard?.analysis" class="story-card analysis-card">
            <div class="story-card-header">
              <div class="story-icon analysis-icon">
                <Lightbulb :size="18" />
              </div>
              <h3>智能分析</h3>
              <span class="ai-badge">AI 示例</span>
            </div>
            <div class="story-content">{{ activeDashboard.analysis }}</div>
          </div>

          <div v-if="activeDashboard?.actions" class="story-card actions-card">
            <div class="story-card-header">
              <div class="story-icon actions-icon">
                <Target :size="18" />
              </div>
              <h3>建議動作</h3>
              <span class="ai-badge">AI 示例</span>
            </div>
            <ul class="actions-list">
              <li v-for="(action, idx) in activeDashboard.actions.split('\n').filter(a => a.trim())" :key="idx">
                {{ action.replace(/^\d+\.\s*/, '') }}
              </li>
            </ul>
          </div>
        </div>
        <p v-if="activeDashboard?.analysis || activeDashboard?.actions" class="ai-disclaimer">
          以上「智能分析」與「建議動作」為預設示例內容，接入 AI 後將依據實際數據自動產生。可在管理頁手動編輯。
        </p> -->
      </template>
    </div>
  </div>
</template>

<style scoped>
.dashboard { flex: 1; overflow-y: auto; padding: 24px 28px; }
.page-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  margin-bottom: 24px;
}
.page-header h2 { font-size: 22px; font-weight: 700; color: #111827; margin: 0; }
.subtitle { font-size: 14px; color: #6b7280; margin-top: 4px; }

.dashboard-switcher { display: flex; align-items: center; gap: 6px; color: #6b7280; }
.dashboard-switcher select {
  padding: 6px 12px; border: 1px solid #d1d5db; border-radius: 6px;
  background: #fff; color: #374151; font-size: 13px; cursor: pointer; min-width: 160px;
}
.dashboard-switcher select:focus { outline: none; border-color: #2563eb; }

/* Filter bar */
.filter-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; background: #fff; border: 1px solid #e5e7eb;
  border-radius: 10px; margin-bottom: 20px;
}
.filter-icon { color: #6b7280; flex-shrink: 0; }
.filter-group {
  display: flex; align-items: center; gap: 6px; color: #6b7280;
}
.filter-group select {
  padding: 5px 10px; border: 1px solid #d1d5db; border-radius: 6px;
  background: #f9fafb; color: #374151; font-size: 13px; cursor: pointer; min-width: 130px;
}
.filter-group select:focus { outline: none; border-color: #2563eb; background: #fff; }
.clear-filter {
  margin-left: auto; padding: 4px 10px; font-size: 12px;
  border: 1px solid #d1d5db; border-radius: 5px;
  background: #fff; color: #6b7280; cursor: pointer;
}
.clear-filter:hover { background: #f3f4f6; color: #374151; }

.empty-state, .empty-dashboard {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 250px; color: #9ca3af; gap: 12px;
}
.empty-state p, .empty-dashboard p { font-size: 14px; }
.loading-hint { text-align: center; padding: 40px; color: #9ca3af; font-size: 14px; }

.kpi-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px; margin-bottom: 24px;
}
.kpi-card {
  display: flex; gap: 14px; padding: 18px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  transition: box-shadow 0.2s;
}
.kpi-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.kpi-icon {
  width: 42px; height: 42px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.kpi-icon.revenue { background: #dbeafe; color: #2563eb; }
.kpi-icon.profit { background: #d1fae5; color: #059669; }
.kpi-icon.margin { background: #fef3c7; color: #d97706; }
.kpi-icon.tables { background: #ede9fe; color: #7c3aed; }
.kpi-body { flex: 1; }
.kpi-label { font-size: 12px; color: #6b7280; font-weight: 500; }
.kpi-value { font-size: 22px; font-weight: 700; color: #111827; margin: 2px 0; }
.kpi-trend { font-size: 12px; color: #9ca3af; display: flex; align-items: center; gap: 4px; }
.kpi-trend.up { color: #059669; }
.kpi-trend.down { color: #dc2626; }

.items-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.grid-item.full { grid-column: 1 / -1; }

.chart-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px;
}
.chart-card h3 { font-size: 14px; font-weight: 600; color: #374151; margin: 0 0 12px; }
.chart { width: 100%; height: 300px; }

.metric-card {
  padding: 18px; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  position: relative; transition: box-shadow 0.2s;
}
.metric-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.metric-header { display: flex; align-items: center; justify-content: space-between; }
.metric-category { font-size: 11px; color: #9ca3af; font-weight: 500; text-transform: uppercase; letter-spacing: 0.03em; }
.metric-name { font-size: 14px; color: #374151; font-weight: 500; margin: 6px 0 8px; }
.metric-value-row { display: flex; align-items: baseline; gap: 8px; }
.metric-value { font-size: 24px; font-weight: 700; color: #111827; }
.metric-value.good { color: #16a34a; }
.metric-value.warn { color: #d97706; }
.metric-value.bad { color: #dc2626; }

.status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.status-dot.good { background: #22c55e; }
.status-dot.warn { background: #f59e0b; }
.status-dot.bad { background: #ef4444; }

.status-label { font-size: 11px; font-weight: 500; padding: 2px 6px; border-radius: 4px; }
.status-label.good { background: #dcfce7; color: #16a34a; }
.status-label.warn { background: #fef3c7; color: #d97706; }
.status-label.bad { background: #fef2f2; color: #dc2626; }

.dashboard-desc {
  font-size: 13px; color: #6b7280; margin-bottom: 20px;
  padding: 10px 14px; background: #f9fafb; border-radius: 8px; border: 1px solid #f3f4f6;
}

/* Story section */
.story-section {
  margin-top: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
}
.story-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
  padding: 20px; transition: box-shadow 0.2s;
}
.story-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.story-card-header {
  display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
}
.story-card-header h3 {
  font-size: 15px; font-weight: 600; color: #111827; margin: 0;
}
.story-icon {
  width: 34px; height: 34px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.analysis-icon { background: #ede9fe; color: #7c3aed; }
.actions-icon { background: #dbeafe; color: #2563eb; }
.analysis-card { border-left: 3px solid #7c3aed; }
.actions-card { border-left: 3px solid #2563eb; }
.story-content {
  font-size: 13px; line-height: 1.8; color: #374151;
}
.actions-list {
  margin: 0; padding: 0; list-style: none;
  display: flex; flex-direction: column; gap: 10px;
}
.actions-list li {
  font-size: 13px; line-height: 1.6; color: #374151;
  padding: 8px 12px; background: #f8fafc; border-radius: 6px;
  border-left: 2px solid #2563eb; position: relative;
}

.ai-badge {
  font-size: 10px; font-weight: 500; padding: 2px 8px;
  border-radius: 10px; background: #f3f4f6; color: #9ca3af;
  border: 1px solid #e5e7eb; letter-spacing: 0.02em;
}
.ai-disclaimer {
  margin-top: 10px; font-size: 11px; color: #9ca3af; text-align: center;
  font-style: italic;
}

/* Popover */
.metric-popover {
  position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
  padding-bottom: 8px; opacity: 0; visibility: hidden;
  transition: opacity 0.15s, visibility 0.15s; z-index: 10; pointer-events: none;
}
.metric-card:hover .metric-popover { opacity: 1; visibility: visible; pointer-events: auto; }

.popover-content {
  background: #1f2937; color: #f3f4f6; border-radius: 8px; padding: 12px 14px;
  font-size: 12px; line-height: 1.5; min-width: 200px; max-width: 280px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15); white-space: normal;
}
.popover-content::after {
  content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
  margin-top: -8px; border: 6px solid transparent; border-top-color: #1f2937;
}
.popover-title { font-weight: 600; font-size: 13px; color: #fff; margin-bottom: 4px; }
.popover-desc { color: #d1d5db; }
.popover-status { margin-top: 6px; padding-top: 6px; border-top: 1px solid #374151; }
.popover-status-text.good { color: #4ade80; }
.popover-status-text.warn { color: #fbbf24; }
.popover-status-text.bad { color: #f87171; }
</style>
