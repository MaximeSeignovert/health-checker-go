import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

export interface MetricPoint {
  value: number
  created: string
}

interface MetricChartProps {
  data: MetricPoint[]
  label: string
  valueLabel: string
  accent: 'mint' | 'blue' | 'orange'
}

const ACCENT_COLORS = {
  mint: '#0c8f63',
  blue: '#287caa',
  orange: '#e8673c',
} as const

export function MetricChart({ data, label, valueLabel, accent }: MetricChartProps) {
  const chartData = data.map((point, index) => ({
    ...point,
    value: Math.min(100, Math.max(0, point.value)),
    sequence: index,
  }))
  if (chartData.length === 1) {
    chartData.push({ ...chartData[0], sequence: 1 })
  }

  const config = {
    value: {
      label: valueLabel,
      color: ACCENT_COLORS[accent],
    },
  } satisfies ChartConfig

  return (
    <ChartContainer
      config={config}
      className={`metric-chart metric-chart--${accent}`}
      role="img"
      aria-label={label}
    >
      <AreaChart accessibilityLayer data={chartData} margin={{ top: 9, right: 4, bottom: 2, left: 4 }}>
        <defs>
          <linearGradient id={`metric-fill-${accent}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="4%" stopColor="var(--color-value)" stopOpacity={0.3} />
            <stop offset="96%" stopColor="var(--color-value)" stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#e4e8e2" strokeDasharray="0" />
        <XAxis dataKey="sequence" hide />
        <YAxis domain={[0, 100]} ticks={[0, 33.33, 66.66, 100]} hide />
        <ChartTooltip
          cursor={{ stroke: 'var(--color-value)', strokeOpacity: 0.35, strokeDasharray: '3 3' }}
          content={(
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(_, payload) => formatMeasurementTime(payload[0])}
              valueFormatter={(value) => `${Number(value).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`}
            />
          )}
        />
        <Area
          dataKey="value"
          type="monotone"
          fill={`url(#metric-fill-${accent})`}
          stroke="var(--color-value)"
          strokeWidth={2.2}
          activeDot={{ r: 5, fill: 'var(--card)', stroke: 'var(--color-value)', strokeWidth: 2.5 }}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}

function formatMeasurementTime(payloadItem: unknown) {
  if (!payloadItem || typeof payloadItem !== 'object' || !('payload' in payloadItem)) return 'Mesure'
  const payload = payloadItem.payload
  if (!payload || typeof payload !== 'object' || !('created' in payload) || typeof payload.created !== 'string') return 'Mesure'

  const normalized = payload.created.includes('T') ? payload.created : payload.created.replace(' ', 'T')
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return 'Mesure'

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
