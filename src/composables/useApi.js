import { useAuth } from './firebase.js'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.dallasurbanists.org'

async function request(path, { method = 'GET', body } = {}) {
  const token = await useAuth().getToken()
  const apiKey = import.meta.env.VITE_API_KEY
  const headers = { ...(apiKey ? { 'X-API-Key': apiKey } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    })
  } catch {
    throw new Error('Could not reach the server. Check the connection and try again.')
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.message || `Request failed (${res.status})`)
  }
  return data
}

export function useApi() {
  return {
    searchContacts: name => request(`/api/contacts?name=${encodeURIComponent(name)}`),
    getContact: id => request(`/api/contacts/${id}`),
    getCurrentUser: () => request('/api/users/me'),
    createContact: payload => request('/api/contacts', { method: 'POST', body: payload }),
    updateContact: (id, payload) => request(`/api/contacts/${id}`, { method: 'PUT', body: payload }),
    createCheckin: payload => request('/api/checkins', { method: 'POST', body: payload }),
    getEventCheckins: eventId => request(`/api/checkins?event_id=${encodeURIComponent(eventId)}`),
    getContactCheckins: contactId => request(`/api/checkins?contact_id=${encodeURIComponent(contactId)}`)
  }
}
