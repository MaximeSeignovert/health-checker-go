const TOKEN_KEY = 'vps-watch.auth-token'

export interface DashboardSession {
  token: string
  email: string
}

interface AuthResponse {
  token: string
  record: { email?: string }
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function getStoredToken() {
  return window.localStorage.getItem(TOKEN_KEY)
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY)
}

function storeToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token)
}

export async function login(identity: string, password: string): Promise<DashboardSession> {
  const response = await fetch('/api/collections/dashboard_users/auth-with-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ identity, password }),
  })
  const payload = await readPayload(response)
  if (!response.ok) {
    throw new ApiError('Identifiants incorrects ou compte indisponible.', response.status)
  }
  const auth = payload as AuthResponse
  storeToken(auth.token)
  return { token: auth.token, email: auth.record.email || identity }
}

export async function restoreSession(): Promise<DashboardSession | null> {
  const token = getStoredToken()
  if (!token) return null

  const response = await fetch('/api/collections/dashboard_users/auth-refresh', {
    method: 'POST',
    headers: { Authorization: token, Accept: 'application/json' },
  })
  if (!response.ok) {
    clearSession()
    return null
  }
  const auth = (await response.json()) as AuthResponse
  storeToken(auth.token)
  return { token: auth.token, email: auth.record.email || 'Compte dashboard' }
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = getStoredToken()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (token) headers.set('Authorization', token)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const response = await fetch(path, { ...init, headers })
  if (!response.ok) {
    const payload = await readPayload(response)
    const message = getErrorMessage(payload) || `PocketBase a répondu ${response.status}`
    throw new ApiError(message, response.status)
  }
  return response
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function getErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null
  const message = Reflect.get(payload, 'message')
  return typeof message === 'string' ? message : null
}
