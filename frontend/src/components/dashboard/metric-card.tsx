import { MetricChart, type MetricPoint } from './metric-chart'

interface MetricCardProps {
  index: string
  title: string
  value: string
  detail: string
  data: MetricPoint[]
  rangeLabel: string
  accent: 'mint' | 'blue' | 'orange'
  loading: boolean
  chartLoading: boolean
}

export function MetricCard({ index, title, value, detail, data, rangeLabel, accent, loading, chartLoading }: MetricCardProps) {
  return (
    <article className={`metric-card metric-card--${accent}`}>
      <div className="metric-card__topline">
        <span>{index}</span>
        <span>DERNIÈRES MESURES</span>
      </div>
      <div className="metric-card__heading">
        <div>
          <h2>{title}</h2>
          <p>{detail}</p>
        </div>
        <p className={loading ? 'metric-value is-loading' : 'metric-value'}>{value}</p>
      </div>
      <div className={chartLoading ? 'metric-card__chart is-loading' : 'metric-card__chart'} aria-busy={chartLoading}>
        <MetricChart data={data} label={`Historique : ${title}`} valueLabel={`${title} · moyenne`} accent={accent} />
        {chartLoading && <span className="metric-card__chart-status">Mise à jour…</span>}
      </div>
      <div className="metric-card__axis" aria-hidden="true"><span>{rangeLabel}</span><span>MAINTENANT</span></div>
    </article>
  )
}
