const COLORS = ['#2563eb', '#d97706', '#059669', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1']

type ChartType = 'line' | 'bar' | 'stacked_bar' | 'pie'

interface BuildOptions {
  title?: string
  yFormatter?: string
  stack?: boolean
  smooth?: boolean
}

function parseYFormatter(fmt?: string): ((v: number) => string) | undefined {
  if (!fmt) return undefined
  return (v: number) => {
    let val: string
    if (fmt.includes('萬')) {
      val = (v / 10000).toFixed(0)
    } else if (fmt.includes('%')) {
      val = v.toFixed(2)
    } else {
      val = String(v)
    }
    return fmt.replace('{v}', val)
  }
}

export function buildChartOption(
  rows: Record<string, unknown>[],
  chartType: ChartType,
  xColumn: string,
  seriesColumns: string[],
  options: BuildOptions = {},
): any {
  if (!rows.length || !seriesColumns.length) return null

  const yFormatter = parseYFormatter(options.yFormatter)
  const baseOption: any = {
    tooltip: { trigger: chartType === 'pie' ? 'item' : 'axis' },
    grid: { top: 30, right: 20, bottom: 50, left: 60 },
  }

  if (chartType === 'pie') {
    baseOption.legend = { bottom: 0, type: 'scroll' }
    baseOption.series = [{
      type: 'pie',
      radius: ['35%', '65%'],
      center: ['50%', '45%'],
      data: rows.map((r, i) => ({
        name: String(r[xColumn] ?? ''),
        value: Number(r[seriesColumns[0]] ?? 0),
        itemStyle: { color: COLORS[i % COLORS.length] },
      })),
      label: { formatter: '{b}: {d}%' },
    }]
    return baseOption
  }

  // line / bar / stacked_bar
  const actualType = chartType === 'stacked_bar' ? 'bar' : chartType
  const isStack = chartType === 'stacked_bar' || options.stack

  baseOption.xAxis = {
    type: 'category',
    data: rows.map(r => String(r[xColumn] ?? '')),
    axisLabel: { fontSize: 11 },
  }
  baseOption.yAxis = {
    type: 'value',
    axisLabel: yFormatter ? { formatter: yFormatter } : { fontSize: 11 },
  }
  baseOption.legend = {
    data: seriesColumns,
    bottom: 0,
    type: 'scroll',
  }
  baseOption.series = seriesColumns.map((col, i) => ({
    name: col,
    type: actualType,
    data: rows.map(r => Number(r[col] ?? 0)),
    smooth: chartType === 'line' ? true : undefined,
    stack: isStack ? 'total' : undefined,
    itemStyle: { color: COLORS[i % COLORS.length] },
    areaStyle: chartType === 'line' ? { color: `${COLORS[i % COLORS.length]}15` } : undefined,
  }))

  return baseOption
}
