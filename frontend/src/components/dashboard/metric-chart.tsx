interface MetricChartProps {
  values: number[]
  label: string
  accent: 'mint' | 'blue' | 'orange'
}

const WIDTH = 600
const HEIGHT = 150

export function MetricChart({ values, label, accent }: MetricChartProps) {
  const safeValues = values.length === 1 ? [values[0], values[0]] : values.length ? values : [0]
  const points = safeValues.map((value, index) => {
    const x = safeValues.length === 1 ? WIDTH : (index / (safeValues.length - 1)) * WIDTH
    const normalized = Math.min(100, Math.max(0, value))
    return { x, y: HEIGHT - (normalized / 100) * HEIGHT }
  })
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
  const area = `${line} L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z`
  const last = points[points.length - 1]

  return (
    <div className={`metric-chart metric-chart--${accent}`} role="img" aria-label={label}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`area-${accent}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.26" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((lineIndex) => (
          <line key={lineIndex} className="chart-gridline" x1="0" x2={WIDTH} y1={lineIndex * 50} y2={lineIndex * 50} />
        ))}
        {values.length > 0 && <path d={area} fill={`url(#area-${accent})`} />}
        {values.length > 0 && <path className="chart-line" d={line} fill="none" vectorEffect="non-scaling-stroke" />}
        {values.length > 0 && <circle className="chart-point-halo" cx={last.x} cy={last.y} r="7" vectorEffect="non-scaling-stroke" />}
        {values.length > 0 && <circle className="chart-point" cx={last.x} cy={last.y} r="3.5" vectorEffect="non-scaling-stroke" />}
      </svg>
    </div>
  )
}
