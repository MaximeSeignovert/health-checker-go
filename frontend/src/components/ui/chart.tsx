import * as React from 'react'
import * as RechartsPrimitive from 'recharts'
import type { TooltipContentProps, TooltipValueType } from 'recharts'

const THEMES = { light: '', dark: '.dark' } as const

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    color?: string
    theme?: Record<keyof typeof THEMES, string>
  }
>

const ChartContext = React.createContext<ChartConfig | null>(null)

function useChart() {
  const config = React.useContext(ChartContext)
  if (!config) throw new Error('useChart must be used within a <ChartContainer />')
  return config
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<'div'> & {
  config: ChartConfig
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children']
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, '')}`

  return (
    <ChartContext.Provider value={config}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={['chart-container', className].filter(Boolean).join(' ')}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer initialDimension={{ width: 320, height: 154 }}>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorConfig = Object.entries(config).filter(([, item]) => item.theme ?? item.color)
  if (!colorConfig.length) return null

  const css = Object.entries(THEMES)
    .map(([theme, prefix]) => `${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, item]) => {
    const color = item.theme?.[theme as keyof typeof THEMES] ?? item.color
    return color ? `  --color-${key}: ${color};` : null
  })
  .filter(Boolean)
  .join('\n')}
}`)
    .join('\n')

  return <style dangerouslySetInnerHTML={{ __html: css }} />
}

const ChartTooltip = RechartsPrimitive.Tooltip

type ChartTooltipContentProps = Partial<TooltipContentProps<TooltipValueType, string>>
  & React.ComponentProps<'div'>
  & {
    hideLabel?: boolean
    hideIndicator?: boolean
    indicator?: 'line' | 'dot' | 'dashed'
    labelFormatter?: (label: React.ReactNode, payload: ReadonlyArray<unknown>) => React.ReactNode
    valueFormatter?: (value: TooltipValueType) => React.ReactNode
  }

function ChartTooltipContent({
  active,
  payload,
  className,
  hideLabel = false,
  hideIndicator = false,
  indicator = 'dot',
  label,
  labelFormatter,
  valueFormatter,
}: ChartTooltipContentProps) {
  const config = useChart()
  if (!active || !payload?.length) return null

  const item = payload[0]
  const dataKey = String(item.dataKey ?? item.name ?? 'value')
  const itemConfig = config[dataKey]
  const itemLabel = itemConfig?.label ?? item.name
  const indicatorColor = item.color ?? itemConfig?.color ?? 'currentColor'
  const tooltipLabel = labelFormatter ? labelFormatter(label, payload) : label

  return (
    <div
      className={['chart-tooltip', className].filter(Boolean).join(' ')}
      data-slot="chart-tooltip"
    >
      {!hideLabel && tooltipLabel ? <p className="chart-tooltip__label">{tooltipLabel}</p> : null}
      <div className="chart-tooltip__row">
        {!hideIndicator && (
          <span
            className={`chart-tooltip__indicator chart-tooltip__indicator--${indicator}`}
            style={{ '--indicator-color': indicatorColor } as React.CSSProperties}
          />
        )}
        <span className="chart-tooltip__name">{itemLabel}</span>
        <strong className="chart-tooltip__value">
          {valueFormatter ? valueFormatter(item.value ?? '') : String(item.value ?? '')}
        </strong>
      </div>
    </div>
  )
}

export { ChartContainer, ChartTooltip, ChartTooltipContent }
