import { Activity, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { login, type DashboardSession } from '@/lib/api'

interface LoginScreenProps {
  onLogin: (session: DashboardSession) => void
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      onLogin(await login(email.trim(), password))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Connexion impossible.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-shell">
      <div className="login-grid" aria-hidden="true" />
      <section className="login-manifesto" aria-labelledby="login-title">
        <a className="brand login-brand" href="/" aria-label="VPS Watch">
          <span className="brand-mark"><Activity size={18} strokeWidth={2.2} /></span>
          <span>VPS<span className="brand-slash">/</span>WATCH</span>
        </a>
        <div>
          <p className="eyebrow">ACCÈS PRIVÉ · OBSERVABILITÉ</p>
          <h1 id="login-title">Votre serveur.<br /><em>Vos yeux seulement.</em></h1>
          <p className="login-intro">Les métriques, adresses et contrôles de santé restent derrière cette porte.</p>
        </div>
        <div className="login-proof">
          <ShieldCheck size={18} />
          <span>API protégée par authentification</span>
        </div>
      </section>

      <section className="login-panel" aria-label="Connexion au dashboard">
        <div className="login-card">
          <div className="login-card__icon"><LockKeyhole size={23} /></div>
          <p className="eyebrow">IDENTIFICATION</p>
          <h2>Ravi de vous revoir.</h2>
          <p className="login-card__copy">Connectez-vous avec le compte configuré sur votre instance.</p>

          <form onSubmit={handleSubmit}>
            <label htmlFor="login-email">Adresse email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              placeholder="vous@exemple.fr"
              required
              autoFocus
            />
            <label htmlFor="login-password">Mot de passe</label>
            <div className="password-field">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Votre mot de passe"
                required
              />
              <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button login-submit" type="submit" disabled={submitting}>
              {submitting ? 'Vérification…' : 'Ouvrir le dashboard'}
            </button>
          </form>
          <p className="login-hint">Les identifiants sont définis par <code>DASHBOARD_ADMIN_EMAIL</code> et <code>DASHBOARD_ADMIN_PASSWORD</code>.</p>
        </div>
      </section>
    </main>
  )
}
