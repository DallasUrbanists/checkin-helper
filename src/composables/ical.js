// Minimal iCalendar (RFC 5545) parser: VEVENT blocks only, no recurrence rules.

function getOffsetMs(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric'
  }).formatToParts(new Date(timestamp))
  const v = Object.fromEntries(parts.map(p => [p.type, Number(p.value)]))
  return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - timestamp
}

function zonedToDate([y, mo, d, h, mi, s], timeZone) {
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi, s)
  // Second pass corrects for a DST change between the guess and the real instant
  const first = wallAsUtc - getOffsetMs(wallAsUtc, timeZone)
  return new Date(wallAsUtc - getOffsetMs(first, timeZone))
}

function parseDate({ params, value }) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value)
  if (!m) return null
  const [y, mo, d, h = 0, mi = 0, s = 0] = m.slice(1, 7).map(Number)
  if (m[7]) return new Date(Date.UTC(y, mo - 1, d, h, mi, s))
  if (params.TZID) {
    try {
      return zonedToDate([y, mo, d, h, mi, s], params.TZID)
    } catch {
      // Unknown TZID falls through to the browser's local time
    }
  }
  return new Date(y, mo - 1, d, h, mi, s)
}

function unescapeText(value = '') {
  return value.replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c))
}

function toEvent(props) {
  const start = props.DTSTART && parseDate(props.DTSTART)
  if (!start || !props.UID) return null
  if (props.STATUS?.value === 'CANCELLED') return null
  return {
    id: props.UID.value.replace(/^event_/, '').replace(/@.*$/, ''),
    title: unescapeText(props.SUMMARY?.value) || 'Untitled event',
    description: unescapeText(props.DESCRIPTION?.value),
    location: unescapeText(props.LOCATION?.value),
    url: props.URL?.value || '',
    start,
    end: props.DTEND ? parseDate(props.DTEND) : null,
    timeZone: props.DTSTART.params.TZID || undefined
  }
}

export function parseIcal(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const events = []
  let current = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {}
    } else if (line === 'END:VEVENT') {
      const event = current && toEvent(current)
      if (event) events.push(event)
      current = null
    } else if (current) {
      const colon = line.indexOf(':')
      if (colon < 0) continue
      const [name, ...rawParams] = line.slice(0, colon).split(';')
      current[name.toUpperCase()] = {
        params: Object.fromEntries(rawParams.map(p => p.split('='))),
        value: line.slice(colon + 1)
      }
    }
  }

  return events
}
