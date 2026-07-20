import { MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'

interface ServiceStatusProps {
  icon: ReactNode
  name: string
  description: string
  healthy?: boolean
  latency?: number
  enabled?: boolean
  address?: string
  onEdit?: () => void
}

export function ServiceStatus({ icon, name, description, healthy, latency, enabled = true, address, onEdit }: ServiceStatusProps) {
  const status = !enabled ? 'paused' : healthy === undefined ? 'unknown' : healthy ? 'up' : 'down'
  const label = status === 'paused' ? 'En pause' : status === 'unknown' ? 'En attente' : status === 'up' ? 'En ligne' : 'Indisponible'
  return (
    <div className={`service-row ${!enabled ? 'service-row--disabled' : ''}`}>
      <div className="service-icon" aria-hidden="true">{icon}</div>
      <div className="service-copy">
        <h3>{name}</h3>
        <p title={address}>{description}</p>
      </div>
      <div className="service-latency">
        <span>{latency === undefined ? '—' : `${Math.round(latency)} ms`}</span>
        <span>LATENCE</span>
      </div>
      <div className={`service-state service-state--${status}`}>
        <span className="service-led" aria-hidden="true" />
        {label}
      </div>
      {onEdit && (
        <button className="service-menu" type="button" onClick={onEdit} aria-label={`Modifier ${name}`}>
          <MoreHorizontal size={18} />
        </button>
      )}
    </div>
  )
}
