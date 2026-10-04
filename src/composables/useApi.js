import { useAuth } from './firebase.js'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.dallasurbanists.org'

export class ApiError extends Error {
  constructor(message, { status = 0, code, details, uncertain = false } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.uncertain = uncertain
  }
}

export async function apiRequest(path, { method = 'GET', body, headers: extraHeaders = {}, cache = 'no-store' } = {}) {
  const { getToken, getAppCheckToken, authVersion } = useAuth()
  const version = authVersion.value
  const token = await getToken()
  const appCheckToken = await getAppCheckToken()
  if (version !== authVersion.value) throw new ApiError('Authentication changed. Please try again.', { status: 401 })
  const apiKey = import.meta.env.VITE_API_KEY
  const headers = { ...(apiKey ? { 'X-API-Key': apiKey } : {}), ...(appCheckToken ? { 'X-Firebase-AppCheck': appCheckToken } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  Object.assign(headers, extraHeaders)
  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      cache,
      body: body ? JSON.stringify(body) : undefined
    })
  } catch {
    throw new ApiError('Could not reach the server. Reconcile the request before retrying.', { uncertain: method !== 'GET' })
  }

  const data = await res.json().catch(() => null)
  if (version !== authVersion.value) throw new ApiError('Authentication changed. Please reload.', { status: 401, uncertain: method !== 'GET' })
  if (!res.ok) {
    throw new ApiError(data?.message || `Request failed (${res.status})`, {
      status: res.status, code: data?.code || data?.error, details: data?.details,
      uncertain: method !== 'GET' && res.status >= 500
    })
  }
  if (data === null && method !== 'GET' && res.status !== 204) {
    throw new ApiError('The server response was incomplete. Reconcile before retrying.', { uncertain: true })
  }
  return data
}

const request = apiRequest

export function useApi() {
  return {
    searchContacts: name => request(`/api/contacts?name=${encodeURIComponent(name)}`),
    getContact: id => request(`/api/contacts/${id}`),
    getCurrentUser: () => request('/api/users/me'),
    createContact: payload => request('/api/contacts', { method: 'POST', body: payload }),
    updateContact: (id, payload) => request(`/api/contacts/${id}`, { method: 'PUT', body: payload }),
    createCheckin: payload => request('/api/checkins', { method: 'POST', body: payload }),
    getEventCheckins: eventId => request(`/api/checkins?event_id=${encodeURIComponent(eventId)}&include_contact=full`),
    getContactCheckins: contactId => request(`/api/checkins?contact_id=${encodeURIComponent(contactId)}&include_contact=full`)
  }
}
