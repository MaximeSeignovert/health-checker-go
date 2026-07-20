import { MetricChart } from './metric-chart'

interface MetricCardProps {
  index: string
  title: string
  value: string
  detail: string
  values: number[]
  accent: 'mint' | 'blue' | 'orange'
  loading: boolean
}

export function MetricCard({ index, title, value, detail, values, accent, loading }: MetricCardProps) {
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
      <MetricChart values={values} label={`Historique : ${title}`} accent={accent} />
      <div className="metric-card__axis" aria-hidden="true"><span>−30 MIN</span><span>MAINTENANT</span></div>
    </article>
  )
}
