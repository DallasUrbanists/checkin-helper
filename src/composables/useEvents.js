import { computed, ref } from 'vue'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.dallasurbanists.org'
const CACHE_KEY = 'dallas-urbanists-events'
const CACHE_TTL_MS = 10 * 60 * 1000
const LOOKBACK_MS = 12 * 60 * 60 * 1000
const LOOKAHEAD_MS = 24 * 60 * 60 * 1000

const events = ref([])
const status = ref('idle')
const error = ref('')
let pending = null

function normalizeEvent(event) {
  const start = new Date(event.start_at)
  if (Number.isNaN(start.getTime())) return null

  return {
    id: String(event.id),
    title: event.title || 'Untitled event',
    description: event.description || '',
    location: event.location || '',
    url: event.url || '',
    start,
    end: event.end_at ? new Date(event.end_at) : null,
    timeZone: event.timezone || undefined
  }
}

function readCache() {
  try {
    const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY) || 'null')
    if (!cached || !Array.isArray(cached.events) || typeof cached.cachedAt !== 'number') return null
    const cachedEvents = cached.events.map(normalizeEvent).filter(Boolean)
    return { events: cachedEvents, fresh: Date.now() - cached.cachedAt < CACHE_TTL_MS }
  } catch {
    window.localStorage.removeItem(CACHE_KEY)
    return null
  }
}

function writeCache(apiEvents) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ cachedAt: Date.now(), events: apiEvents }))
  } catch {
    // Event loading still works when storage is unavailable or full.
  }
}

function load() {
  if (pending) return pending

  const cached = readCache()
  if (cached) {
    events.value = cached.events
    status.value = 'loaded'
    error.value = ''
    if (cached.fresh) return Promise.resolve()
  } else {
    status.value = 'loading'
    error.value = ''
  }

  pending = fetch(`${BASE_URL}/api/events?status=CONFIRMED&order=asc&limit=100`)
    .then(res => {
      if (!res.ok) throw new Error(`Events request failed (${res.status})`)
      return res.json()
    })
    .then(result => {
      if (!Array.isArray(result.data)) throw new Error('Events response was invalid.')
      const fetchedEvents = result.data.map(normalizeEvent).filter(Boolean)
      events.value = fetchedEvents
      writeCache(result.data)
      status.value = 'loaded'
      error.value = ''
    })
    .catch(e => {
      error.value = e.message || 'Could not load events.'
      if (!events.value.length) status.value = 'error'
    })
    .finally(() => {
      pending = null
    })
  return pending
}

const current = computed(() => {
  const now = Date.now()
  return events.value
    .filter(e => {
      const start = e.start.getTime()
      return start >= now - LOOKBACK_MS && start <= now + LOOKAHEAD_MS
    })
    .sort((a, b) => a.start - b.start)
})

const future = computed(() => {
  const now = Date.now()
  return events.value
    .filter(e => {
      const start = e.start.getTime()
      return start > now + LOOKAHEAD_MS
    })
    .sort((a, b) => a.start - b.start)
})

const past = computed(() => {
  const now = Date.now()
  return events.value
    .filter(event => event.start.getTime() < now - LOOKBACK_MS)
    .sort((first, second) => second.start - first.start)
})

export function formatEventDate(event) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: event.timeZone,
    timeZoneName: 'short'
  }).format(event.start)
}

export function findEvent(id) {
  return events.value.find(e => e.id === id) ?? null
}

export function useEvents() {
  return { events, current, upcoming: current, future, past, status, error, load, findEvent, formatEventDate }
}
