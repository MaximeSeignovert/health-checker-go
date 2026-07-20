import { Globe2, Plus, Save, Trash2, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { ServiceStatus } from './service-status'

export interface HealthCheck {
  id: string
  name: string
  url: string
  enabled: boolean
  healthy: boolean
  latency_ms: number
  last_error: string
  last_checked: string
  created: string
  updated: string
}

interface HealthChecksPanelProps {
  checks: HealthCheck[]
  loading: boolean
  onChanged: () => Promise<void>
}

const emptyDraft = { name: '', url: '', enabled: true }

export function HealthChecksPanel({ checks, loading, onChanged }: HealthChecksPanelProps) {
  const [editing, setEditing] = useState<HealthCheck | null>(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openCreate() {
    setError(null)
    setEditing(null)
    setDraft(emptyDraft)
    setFormOpen(true)
  }

  function openEdit(check: HealthCheck) {
    setError(null)
    setEditing(check)
    setDraft({ name: check.name, url: check.url, enabled: check.enabled })
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditing(null)
    setDraft(emptyDraft)
  }

  async function saveCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const path = editing
        ? `/api/collections/health_checks/records/${editing.id}`
        : '/api/collections/health_checks/records'
      await apiFetch(path, {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({ name: draft.name.trim(), url: draft.url.trim(), enabled: draft.enabled }),
      })
      closeForm()
      await onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Enregistrement impossible.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteCheck() {
    if (!editing || !window.confirm(`Supprimer le check « ${editing.name} » ?`)) return
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/api/collections/health_checks/records/${editing.id}`, { method: 'DELETE' })
      closeForm()
      await onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Suppression impossible.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="services-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">HEALTH CHECKS</p>
          <h2>Services surveillés</h2>
        </div>
        <div className="panel-heading__actions">
          <p>Contrôle HTTP automatique</p>
          <button className="add-check-button" type="button" onClick={openCreate}>
            <Plus size={15} /> Ajouter
          </button>
        </div>
      </div>

      {formOpen && (
        <form className="check-form" onSubmit={saveCheck}>
          <div className="check-form__heading">
            <div>
              <p className="eyebrow">{editing ? 'MODIFIER LE CHECK' : 'NOUVEAU CHECK'}</p>
              <h3>{editing ? editing.name : 'Ajouter un service'}</h3>
            </div>
            <button className="icon-button" type="button" onClick={closeForm} aria-label="Fermer le formulaire"><X size={17} /></button>
          </div>
          <div className="check-form__grid">
            <label>
              <span>Nom du service</span>
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Mon frontend" maxLength={100} required />
            </label>
            <label>
              <span>Adresse du health check</span>
              <input type="url" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://exemple.fr/health" required />
            </label>
          </div>
          <div className="check-form__footer">
            <label className="toggle-field">
              <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
              <span aria-hidden="true" />
              Check actif
            </label>
            <div className="check-form__buttons">
              {editing && <button className="danger-button" type="button" onClick={() => void deleteCheck()} disabled={saving}><Trash2 size={14} /> Supprimer</button>}
              <button className="primary-button" type="submit" disabled={saving}><Save size={14} /> {saving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      )}

      <div className="services-list">
        {loading && checks.length === 0 && <p className="services-empty">Chargement des services…</p>}
        {!loading && checks.length === 0 && (
          <div className="services-empty">
            <Globe2 size={21} />
            <p>Aucun service surveillé. Ajoutez votre premier endpoint.</p>
          </div>
        )}
        {checks.map((check) => (
          <ServiceStatus
            key={check.id}
            icon={<Globe2 size={20} />}
            name={check.name}
            description={shortenURL(check.url)}
            address={check.url}
            healthy={check.last_checked ? check.healthy : undefined}
            latency={check.last_checked ? check.latency_ms : undefined}
            enabled={check.enabled}
            onEdit={() => openEdit(check)}
          />
        ))}
      </div>
    </div>
  )
}

function shortenURL(value: string) {
  try {
    const url = new URL(value)
    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return value
  }
}
