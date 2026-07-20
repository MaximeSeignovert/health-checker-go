import type { ReactNode } from 'react'

interface ServiceStatusProps {
  icon: ReactNode
  name: string
  description: string
  healthy?: boolean
  latency?: number
}

export function ServiceStatus({ icon, name, description, healthy, latency }: ServiceStatusProps) {
  const status = healthy === undefined ? 'unknown' : healthy ? 'up' : 'down'
  const label = status === 'unknown' ? 'En attente' : status === 'up' ? 'En ligne' : 'Indisponible'
  return (
    <div className="service-row">
      <div className="service-icon" aria-hidden="true">{icon}</div>
      <div className="service-copy">
        <h3>{name}</h3>
        <p>{description}</p>
      </div>
      <div className="service-latency">
        <span>{latency === undefined ? '—' : `${Math.round(latency)} ms`}</span>
        <span>LATENCE</span>
      </div>
      <div className={`service-state service-state--${status}`}>
        <span className="service-led" aria-hidden="true" />
        {label}
      </div>
    </div>
  )
}
