import { createFileRoute } from '@tanstack/react-router'
import {
  Activity,
  Database,
  HardDrive,
  RefreshCw,
  Server,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MetricCard } from '@/components/dashboard/metric-card'
import { ServiceStatus } from '@/components/dashboard/service-status'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  const [metrics, setMetrics] = useState<MetricRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(0)

  const loadMetrics = useCallback(async (signal?: AbortSignal, manual = false) => {
    if (manual) setRefreshing(true)
    try {
      const params = new URLSearchParams({
        page: '1',
        perPage: '120',
        sort: '-created',
        fields:
          'id,cpu_percent,memory_percent,memory_used_bytes,memory_total_bytes,disk_percent,disk_free_bytes,disk_total_bytes,frontend_healthy,frontend_latency_ms,pocketbase_healthy,pocketbase_latency_ms,hostname,created',
      })
      const response = await fetch(
        `/api/collections/system_metrics/records?${params.toString()}`,
        { signal, headers: { Accept: 'application/json' } },
      )
      if (!response.ok) {
        throw new Error(`PocketBase a répondu ${response.status}`)
      }
      const payload = (await response.json()) as MetricsResponse
      setMetrics(payload.items.reverse())
      setError(null)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(caught instanceof Error ? caught.message : 'Connexion impossible')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const initialLoad = window.setTimeout(() => {
      setNow(Date.now())
      void loadMetrics(controller.signal)
    }, 0)
    const poller = window.setInterval(() => void loadMetrics(), 15_000)
    const clock = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => {
      controller.abort()
      window.clearTimeout(initialLoad)
      window.clearInterval(poller)
      window.clearInterval(clock)
    }
  }, [loadMetrics])

  const latest = metrics[metrics.length - 1]
  const latestTime = latest ? new Date(normalizePocketBaseDate(latest.created)).getTime() : 0
  const isFresh = latestTime > 0 && now - latestTime < 45_000
  const allHealthy = Boolean(
    latest && latest.frontend_healthy && latest.pocketbase_healthy,
  )
  const state = getSystemState({ hasData: Boolean(latest), isFresh, allHealthy, error })

  const cpuValues = useMemo(() => metrics.map((metric) => metric.cpu_percent), [metrics])
  const memoryValues = useMemo(
    () => metrics.map((metric) => metric.memory_percent),
    [metrics],
  )
  const diskValues = useMemo(
    () => metrics.map((metric) => 100 - metric.disk_percent),
    [metrics],
  )

  return (
    <main className="dashboard-shell">
      <div className="ambient-grid" aria-hidden="true" />
      <header className="topbar">
        <a className="brand" href="/" aria-label="Aperçu du VPS">
          <span className="brand-mark"><Activity size={18} strokeWidth={2.2} /></span>
          <span>VPS<span className="brand-slash">/</span>WATCH</span>
        </a>
        <div className={`system-pill system-pill--${state.tone}`}>
          <span className="status-dot" aria-hidden="true" />
          <span>{state.shortLabel}</span>
        </div>
      </header>

      <section className="hero" aria-labelledby="dashboard-title">
        <div>
          <p className="eyebrow">MONITEUR SYSTÈME · {latest?.hostname || 'VPS PRINCIPAL'}</p>
          <h1 id="dashboard-title">Tout va bien<br /><em>là-haut ?</em></h1>
        </div>
        <div className="hero-summary">
          <p className="hero-summary__label">État actuel</p>
          <p className="hero-summary__value">{state.label}</p>
          <div className="freshness-row">
            <span>{latest ? formatRelativeTime(latestTime, now) : 'Aucune mesure reçue'}</span>
            <button
              className="refresh-button"
              type="button"
              onClick={() => void loadMetrics(undefined, true)}
              disabled={refreshing}
              aria-label="Actualiser les métriques"
            >
              <RefreshCw size={15} className={refreshing ? 'is-spinning' : ''} />
              Actualiser
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="connection-banner" role="alert">
          <span>La dernière actualisation a échoué.</span>
          <span>{error}</span>
        </div>
      )}

      <section className="metrics-grid" aria-label="Métriques du serveur">
        <MetricCard
          index="01"
          title="Processeur"
          value={latest ? `${latest.cpu_percent.toFixed(1)} %` : '—'}
          detail="Charge instantanée"
          values={cpuValues}
          accent="mint"
          loading={loading}
        />
        <MetricCard
          index="02"
          title="Mémoire vive"
          value={latest ? `${latest.memory_percent.toFixed(1)} %` : '—'}
          detail={latest ? `${formatBytes(latest.memory_used_bytes)} sur ${formatBytes(latest.memory_total_bytes)}` : 'Utilisation de la RAM'}
          values={memoryValues}
          accent="blue"
          loading={loading}
        />
        <MetricCard
          index="03"
          title="Disque libre"
          value={latest ? formatBytes(latest.disk_free_bytes) : '—'}
          detail={latest ? `${(100 - latest.disk_percent).toFixed(1)} % de ${formatBytes(latest.disk_total_bytes)} disponibles` : 'Espace encore disponible'}
          values={diskValues}
          accent="orange"
          loading={loading}
        />
      </section>

      <section className="lower-grid">
        <div className="services-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">HEALTH CHECKS</p>
              <h2>Services essentiels</h2>
            </div>
            <p>Contrôle HTTP toutes les 15 secondes</p>
          </div>
          <div className="services-list">
            <ServiceStatus
              icon={<Server size={20} />}
              name="Frontend"
              description="Interface et proxy Nginx"
              healthy={latest?.frontend_healthy}
              latency={latest?.frontend_latency_ms}
            />
            <ServiceStatus
              icon={<Database size={20} />}
              name="PocketBase"
              description="API et stockage SQLite"
              healthy={latest?.pocketbase_healthy}
              latency={latest?.pocketbase_latency_ms}
            />
          </div>
        </div>

        <aside className="observation-card" aria-label="Fenêtre d'observation">
          <div className="observation-icon"><HardDrive size={22} /></div>
          <div>
            <p className="eyebrow">FENÊTRE ACTIVE</p>
            <p className="observation-number">{metrics.length}</p>
            <p className="observation-copy">mesures affichées sur les graphiques. L’historique est conservé 7 jours par défaut.</p>
          </div>
          <div className="observation-rule" />
          <p className="observation-foot">Collecte légère · aucun agent tiers</p>
        </aside>
      </section>

      <footer>
        <span>VPS WATCH / INSTANCE 01</span>
        <span>{new Date(now).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
      </footer>
    </main>
  )
}

interface MetricRecord {
  id: string
  cpu_percent: number
  memory_percent: number
  memory_used_bytes: number
  memory_total_bytes: number
  disk_percent: number
  disk_free_bytes: number
  disk_total_bytes: number
  frontend_healthy: boolean
  frontend_latency_ms: number
  pocketbase_healthy: boolean
  pocketbase_latency_ms: number
  hostname: string
  created: string
}

interface MetricsResponse {
  items: MetricRecord[]
}

function getSystemState({
  hasData,
  isFresh,
  allHealthy,
  error,
}: {
  hasData: boolean
  isFresh: boolean
  allHealthy: boolean
  error: string | null
}) {
  if (!hasData) return { label: 'En attente de la première mesure', shortLabel: 'Initialisation', tone: 'neutral' }
  if (!isFresh) return { label: 'Les données ne sont plus à jour', shortLabel: 'Données en retard', tone: 'warning' }
  if (!allHealthy) return { label: 'Un service demande votre attention', shortLabel: 'Incident détecté', tone: 'danger' }
  if (error) return { label: 'Le VPS répond, actualisation instable', shortLabel: 'Connexion instable', tone: 'warning' }
  return { label: 'Tous les systèmes sont opérationnels', shortLabel: 'Opérationnel', tone: 'success' }
}

function normalizePocketBaseDate(value: string) {
  return value.includes('T') ? value : value.replace(' ', 'T')
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 Go'
  const gib = value / 1024 ** 3
  return `${gib >= 100 ? gib.toFixed(0) : gib.toFixed(1)} Go`
}

function formatRelativeTime(timestamp: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 4) return 'Mesuré à l’instant'
  if (seconds < 60) return `Mesuré il y a ${seconds} s`
  return `Mesuré il y a ${Math.floor(seconds / 60)} min`
}
