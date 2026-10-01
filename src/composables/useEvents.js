import { computed, ref } from 'vue'
import { parseIcal } from './ical.js'

const ICAL_URL = import.meta.env.VITE_ICAL_URL || '/meetup-ical'
const LOOKBACK_MS = 12 * 60 * 60 * 1000
const LOOKAHEAD_MS = 24 * 60 * 60 * 1000

const events = ref([])
const status = ref('idle')
const error = ref('')
let pending = null

function load() {
  if (status.value === 'loaded') return Promise.resolve()
  if (pending) return pending

  status.value = 'loading'
  error.value = ''
  pending = fetch(ICAL_URL)
    .then(res => {
      if (!res.ok) throw new Error(`Calendar request failed (${res.status})`)
      return res.text()
    })
    .then(text => {
      events.value = parseIcal(text)
      status.value = 'loaded'
    })
    .catch(e => {
      error.value = e.message || 'Could not load events.'
      status.value = 'error'
    })
    .finally(() => {
      pending = null
    })
  return pending
}

const upcoming = computed(() => {
  const now = Date.now()
  return events.value
    .filter(e => {
      const start = e.start.getTime()
      return start >= now - LOOKBACK_MS && start <= now + LOOKAHEAD_MS
    })
    .sort((a, b) => a.start - b.start)
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
  return { events, upcoming, status, error, load, findEvent, formatEventDate }
}
