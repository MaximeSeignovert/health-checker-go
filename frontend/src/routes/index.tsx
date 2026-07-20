import { createFileRoute } from '@tanstack/react-router'
import {
  Activity,
  HardDrive,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { LoginScreen } from '@/components/auth/login-screen'
import { HealthChecksPanel, type HealthCheck } from '@/components/dashboard/health-checks-panel'
import { MetricCard } from '@/components/dashboard/metric-card'
import {
  ApiError,
  apiFetch,
  clearSession,
  restoreSession,
  type DashboardSession,
} from '@/lib/api'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  const [session, setSession] = useState<DashboardSession | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    void restoreSession().then((restored) => {
      if (active) setSession(restored)
    })
    return () => { active = false }
  }, [])

  function logout() {
    clearSession()
    setSession(null)
  }

  if (session === undefined) {
    return (
      <main className="session-loader" aria-label="Vérification de la session">
        <span className="brand-mark"><Activity size={18} /></span>
        <p>Vérification de l’accès sécurisé…</p>
      </main>
    )
  }
  if (!session) return <LoginScreen onLogin={setSession} />
  return <Dashboard session={session} onLogout={logout} />
}

interface DashboardProps {
  session: DashboardSession
  onLogout: () => void
}

function Dashboard({ session, onLogout }: DashboardProps) {
  const [metrics, setMetrics] = useState<MetricRecord[]>([])
  const [checks, setChecks] = useState<HealthCheck[]>([])
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [checksLoading, setChecksLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(0)

  const handleRequestError = useCallback((caught: unknown, fallback: string) => {
    if (caught instanceof ApiError && caught.status === 401) {
      onLogout()
      return 'Votre session a expiré.'
    }
    return caught instanceof Error ? caught.message : fallback
  }, [onLogout])

  const loadMetrics = useCallback(async (signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams({
        page: '1',
        perPage: '120',
        sort: '-created',
        fields:
          'id,cpu_percent,memory_percent,memory_used_bytes,memory_total_bytes,disk_percent,disk_free_bytes,disk_total_bytes,frontend_healthy,frontend_latency_ms,pocketbase_healthy,pocketbase_latency_ms,hostname,created',
      })
      const response = await apiFetch(`/api/collections/system_metrics/records?${params.toString()}`, { signal })
      const payload = (await response.json()) as MetricsResponse
      setMetrics(payload.items.reverse())
      setError(null)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(handleRequestError(caught, 'Connexion aux métriques impossible.'))
    } finally {
      setMetricsLoading(false)
    }
  }, [handleRequestError])

  const loadChecks = useCallback(async (signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams({
        page: '1',
        perPage: '200',
        sort: 'created',
        fields: 'id,name,url,enabled,healthy,latency_ms,last_error,last_checked,created,updated',
      })
      const response = await apiFetch(`/api/collections/health_checks/records?${params.toString()}`, { signal })
      const payload = (await response.json()) as HealthChecksResponse
      setChecks(payload.items)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(handleRequestError(caught, 'Connexion aux health checks impossible.'))
    } finally {
      setChecksLoading(false)
    }
  }, [handleRequestError])

  const refreshAll = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    await Promise.all([loadMetrics(), loadChecks()])
    setNow(Date.now())
    setRefreshing(false)
  }, [loadChecks, loadMetrics])

  useEffect(() => {
    const controller = new AbortController()
    const initialLoad = window.setTimeout(() => {
      setNow(Date.now())
      void Promise.all([loadMetrics(controller.signal), loadChecks(controller.signal)])
    }, 0)
    const poller = window.setInterval(() => void refreshAll(), 15_000)
    const clock = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => {
      controller.abort()
      window.clearTimeout(initialLoad)
      window.clearInterval(poller)
      window.clearInterval(clock)
    }
  }, [loadChecks, loadMetrics, refreshAll])

  const latest = metrics[metrics.length - 1]
  const latestTime = latest ? new Date(normalizePocketBaseDate(latest.created)).getTime() : 0
  const isFresh = latestTime > 0 && now - latestTime < 45_000
  const activeChecks = checks.filter((check) => check.enabled)
  const customChecksHealthy = activeChecks.every((check) => Boolean(check.last_checked) && check.healthy)
  const allHealthy = Boolean(
    latest
    && latest.frontend_healthy
    && latest.pocketbase_healthy
    && (checksLoading || customChecksHealthy),
  )
  const state = getSystemState({ hasData: Boolean(latest), isFresh, allHealthy, error })

  const cpuData = useMemo(() => metrics.map((metric) => ({ value: metric.cpu_percent, created: metric.created })), [metrics])
  const memoryData = useMemo(() => metrics.map((metric) => ({ value: metric.memory_percent, created: metric.created })), [metrics])
  const diskData = useMemo(() => metrics.map((metric) => ({ value: 100 - metric.disk_percent, created: metric.created })), [metrics])

  return (
    <main className="dashboard-shell">
      <div className="ambient-grid" aria-hidden="true" />
      <header className="topbar">
        <a className="brand" href="/" aria-label="Aperçu du VPS">
          <span className="brand-mark"><Activity size={18} strokeWidth={2.2} /></span>
          <span>VPS<span className="brand-slash">/</span>WATCH</span>
        </a>
        <div className="topbar-actions">
          <div className={`system-pill system-pill--${state.tone}`}>
            <span className="status-dot" aria-hidden="true" />
            <span>{state.shortLabel}</span>
          </div>
          <div className="account-chip" title={session.email}>
            <ShieldCheck size={15} />
            <span>{session.email}</span>
            <button type="button" onClick={onLogout} aria-label="Se déconnecter"><LogOut size={14} /></button>
          </div>
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
              onClick={() => void refreshAll(true)}
              disabled={refreshing}
              aria-label="Actualiser les métriques et les services"
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
          data={cpuData}
          accent="mint"
          loading={metricsLoading}
        />
        <MetricCard
          index="02"
          title="Mémoire vive"
          value={latest ? `${latest.memory_percent.toFixed(1)} %` : '—'}
          detail={latest ? `${formatBytes(latest.memory_used_bytes)} sur ${formatBytes(latest.memory_total_bytes)}` : 'Utilisation de la RAM'}
          data={memoryData}
          accent="blue"
          loading={metricsLoading}
        />
        <MetricCard
          index="03"
          title="Disque libre"
          value={latest ? formatBytes(latest.disk_free_bytes) : '—'}
          detail={latest ? `${(100 - latest.disk_percent).toFixed(1)} % de ${formatBytes(latest.disk_total_bytes)} disponibles` : 'Espace encore disponible'}
          data={diskData}
          accent="orange"
          loading={metricsLoading}
        />
      </section>

      <section className="lower-grid">
        <HealthChecksPanel checks={checks} loading={checksLoading} onChanged={loadChecks} />

        <aside className="observation-card" aria-label="Fenêtre d’observation">
          <div className="observation-icon"><HardDrive size={22} /></div>
          <div>
            <p className="eyebrow">FENÊTRE ACTIVE</p>
            <p className="observation-number">{metrics.length}</p>
            <p className="observation-copy">mesures affichées sur les graphiques. L’historique est conservé 7 jours par défaut.</p>
          </div>
          <div className="observation-rule" />
          <p className="observation-foot">Session privée · {activeChecks.length} check{activeChecks.length > 1 ? 's' : ''} actif{activeChecks.length > 1 ? 's' : ''}</p>
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

interface MetricsResponse { items: MetricRecord[] }
interface HealthChecksResponse { items: HealthCheck[] }

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
