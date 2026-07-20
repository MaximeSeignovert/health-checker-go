import { createFileRoute } from '@tanstack/react-router'
import {
  Activity,
  HardDrive,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LoginScreen } from '@/components/auth/login-screen'
import { HealthChecksPanel, type HealthCheck } from '@/components/dashboard/health-checks-panel'
import { MetricCard } from '@/components/dashboard/metric-card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

type MetricRange = '1h' | '24h' | '7d'

const METRIC_RANGES: Record<MetricRange, { label: string; axisLabel: string; bucketSeconds: number }> = {
  '1h': { label: '1 heure', axisLabel: '−1 H', bucketSeconds: 30 },
  '24h': { label: '24 heures', axisLabel: '−24 H', bucketSeconds: 5 * 60 },
  '7d': { label: '1 semaine', axisLabel: '−7 J', bucketSeconds: 30 * 60 },
}

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
  const [latest, setLatest] = useState<MetricRecord | null>(null)
  const [metricPoints, setMetricPoints] = useState<MetricHistoryPoint[]>([])
  const [metricRange, setMetricRange] = useState<MetricRange>('1h')
  const [bucketSeconds, setBucketSeconds] = useState(METRIC_RANGES['1h'].bucketSeconds)
  const [checks, setChecks] = useState<HealthCheck[]>([])
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [checksLoading, setChecksLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(0)
  const metricsRequestId = useRef(0)

  const handleRequestError = useCallback((caught: unknown, fallback: string) => {
    if (caught instanceof ApiError && caught.status === 401) {
      onLogout()
      return 'Votre session a expiré.'
    }
    return caught instanceof Error ? caught.message : fallback
  }, [onLogout])

  const loadMetrics = useCallback(async (range: MetricRange, signal?: AbortSignal) => {
    const requestId = ++metricsRequestId.current
    try {
      const params = new URLSearchParams({ range })
      const response = await apiFetch(`/api/vps-watch/metrics?${params.toString()}`, { signal })
      const payload = (await response.json()) as MetricsHistoryResponse
      if (requestId !== metricsRequestId.current || signal?.aborted) return
      if (payload.range !== range) throw new Error('La période retournée ne correspond pas à la période demandée.')
      setLatest(payload.latest)
      setMetricPoints(payload.items)
      setBucketSeconds(payload.bucketSeconds)
      setError(null)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(handleRequestError(caught, 'Connexion aux métriques impossible.'))
    } finally {
      if (requestId === metricsRequestId.current) {
        setMetricsLoading(false)
        setHistoryLoading(false)
      }
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
    await Promise.all([loadMetrics(metricRange), loadChecks()])
    setNow(Date.now())
    setRefreshing(false)
  }, [loadChecks, loadMetrics, metricRange])

  useEffect(() => {
    const controller = new AbortController()
    const initialLoad = window.setTimeout(() => {
      setNow(Date.now())
      void loadMetrics(metricRange, controller.signal)
    }, 0)
    return () => {
      controller.abort()
      window.clearTimeout(initialLoad)
    }
  }, [loadMetrics, metricRange])

  useEffect(() => {
    const controller = new AbortController()
    const initialLoad = window.setTimeout(() => void loadChecks(controller.signal), 0)
    return () => {
      controller.abort()
      window.clearTimeout(initialLoad)
    }
  }, [loadChecks])

  useEffect(() => {
    const controller = new AbortController()
    const poller = window.setInterval(() => {
      void Promise.all([loadMetrics(metricRange, controller.signal), loadChecks(controller.signal)])
    }, 15_000)
    return () => {
      controller.abort()
      window.clearInterval(poller)
    }
  }, [loadChecks, loadMetrics, metricRange])

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(clock)
  }, [])

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

  const cpuData = useMemo(() => metricPoints.map((metric) => ({ value: metric.cpu_percent, created: metric.created })), [metricPoints])
  const memoryData = useMemo(() => metricPoints.map((metric) => ({ value: metric.memory_percent, created: metric.created })), [metricPoints])
  const diskData = useMemo(() => metricPoints.map((metric) => ({ value: 100 - metric.disk_percent, created: metric.created })), [metricPoints])
  const rangeConfig = METRIC_RANGES[metricRange]

  function changeMetricRange(value: string) {
    if (!isMetricRange(value) || value === metricRange) return
    setMetricRange(value)
    setBucketSeconds(METRIC_RANGES[value].bucketSeconds)
    setMetricPoints([])
    setHistoryLoading(true)
  }

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

      <section className="metrics-toolbar" aria-label="Période des statistiques">
        <div>
          <p className="eyebrow">HISTORIQUE SYSTÈME</p>
          <p>Moyennes consolidées · actualisation toutes les 15 secondes</p>
        </div>
        <div className="metrics-toolbar__control">
          <span className={historyLoading ? 'metrics-toolbar__status is-loading' : 'metrics-toolbar__status'}>
            {historyLoading ? 'CHARGEMENT' : `${metricPoints.length} POINTS`}
          </span>
          <label id="metric-range-label">PÉRIODE AFFICHÉE</label>
          <Select value={metricRange} onValueChange={changeMetricRange}>
            <SelectTrigger aria-labelledby="metric-range-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(METRIC_RANGES) as Array<[MetricRange, (typeof METRIC_RANGES)[MetricRange]]>).map(([value, option]) => (
                <SelectItem value={value} key={value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="metrics-grid" aria-label="Métriques du serveur">
        <MetricCard
          index="01"
          title="Processeur"
          value={latest ? `${latest.cpu_percent.toFixed(1)} %` : '—'}
          detail="Charge instantanée"
          data={cpuData}
          rangeLabel={rangeConfig.axisLabel}
          accent="mint"
          loading={metricsLoading}
          chartLoading={historyLoading}
        />
        <MetricCard
          index="02"
          title="Mémoire vive"
          value={latest ? `${latest.memory_percent.toFixed(1)} %` : '—'}
          detail={latest ? `${formatBytes(latest.memory_used_bytes)} sur ${formatBytes(latest.memory_total_bytes)}` : 'Utilisation de la RAM'}
          data={memoryData}
          rangeLabel={rangeConfig.axisLabel}
          accent="blue"
          loading={metricsLoading}
          chartLoading={historyLoading}
        />
        <MetricCard
          index="03"
          title="Disque libre"
          value={latest ? formatBytes(latest.disk_free_bytes) : '—'}
          detail={latest ? `${(100 - latest.disk_percent).toFixed(1)} % de ${formatBytes(latest.disk_total_bytes)} disponibles` : 'Espace encore disponible'}
          data={diskData}
          rangeLabel={rangeConfig.axisLabel}
          accent="orange"
          loading={metricsLoading}
          chartLoading={historyLoading}
        />
      </section>

      <section className="lower-grid">
        <HealthChecksPanel checks={checks} loading={checksLoading} onChanged={loadChecks} />

        <aside className="observation-card" aria-label="Fenêtre d’observation">
          <div className="observation-icon"><HardDrive size={22} /></div>
          <div>
            <p className="eyebrow">FENÊTRE ACTIVE</p>
            <p className="observation-number">{metricPoints.length}</p>
            <p className="observation-copy">points affichés sur {rangeConfig.label.toLowerCase()}. Chaque point représente une moyenne de {formatBucketDuration(bucketSeconds)}.</p>
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

interface MetricHistoryPoint {
  created: string
  cpu_percent: number
  memory_percent: number
  disk_percent: number
}

interface MetricsHistoryResponse {
  range: MetricRange
  bucketSeconds: number
  from: string
  to: string
  latest: MetricRecord | null
  items: MetricHistoryPoint[]
}
interface HealthChecksResponse { items: HealthCheck[] }

function isMetricRange(value: string): value is MetricRange {
  return value === '1h' || value === '24h' || value === '7d'
}

function formatBucketDuration(seconds: number) {
  if (seconds < 60) return `${seconds} secondes`
  const minutes = seconds / 60
  return `${minutes} minute${minutes > 1 ? 's' : ''}`
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
