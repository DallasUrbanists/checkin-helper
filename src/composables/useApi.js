const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.dallasurbanists.org'

async function request(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
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
    createContact: payload => request('/api/contacts', { method: 'POST', body: payload }),
    updateContact: (id, payload) => request(`/api/contacts/${id}`, { method: 'PUT', body: payload }),
    createCheckin: payload => request('/api/checkins', { method: 'POST', body: payload })
  }
}
