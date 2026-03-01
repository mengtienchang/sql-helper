<script setup lang="ts">
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart, PieChart as EPieChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent,
  GridComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'
import { buildChartOption } from '../composables/useChartRenderer'

use([
  CanvasRenderer, LineChart, BarChart, EPieChart,
  TitleComponent, TooltipComponent, LegendComponent, GridComponent,
])

const props = defineProps<{
  rows: Record<string, unknown>[]
  chartType: string
  xColumn: string
  seriesColumns: string[]
  yFormatter?: string
  stack?: boolean
}>()

const option = computed(() => {
  if (!props.rows.length || !props.seriesColumns.length || !props.xColumn) return null
  return buildChartOption(
    props.rows,
    props.chartType as any,
    props.xColumn,
    props.seriesColumns,
    { yFormatter: props.yFormatter, stack: props.stack },
  )
})
</script>

<template>
  <div class="chart-preview">
    <VChart v-if="option" :option="option" autoresize class="chart" />
    <div v-else class="no-data">無法渲染圖表</div>
  </div>
</template>

<style scoped>
.chart-preview { width: 100%; height: 100%; min-height: 200px; }
.chart { width: 100%; height: 100%; }
.no-data {
  display: flex; align-items: center; justify-content: center;
  height: 100%; color: #9ca3af; font-size: 13px;
}
</style>
