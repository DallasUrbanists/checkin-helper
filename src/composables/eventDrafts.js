import { Temporal } from '@js-temporal/polyfill'
import { phoneDigits, toStoragePhone } from './contactUtils.js'
import { normalizeName, validateName, validateEmail, validatePhone, validateZip } from './validation.js'

export function contactFor(row) {
  return row?.contact || row?.contact_data || null
}

export function rowTimestamp(row) {
  return row?.submitted_on || row?.created_at || row?.checked_in_at || ''
}

function contactId(row) {
  return row?.contact_id ?? contactFor(row)?.id
}

function list(value) {
  return value.split(',').map(part => part.trim()).filter(Boolean)
}

function same(first, second) {
  return JSON.stringify(first) === JSON.stringify(second)
}

function interval(event) {
  try {
    if (!event?.timeZone || !(event.start instanceof Date)) return null
    const start = Temporal.Instant.from(event.start.toISOString())
    // Validate the zone even when the event has no end.
    start.toZonedDateTimeISO(event.timeZone)
    const end = event.end == null ? null : Temporal.Instant.from(event.end.toISOString())
    if (end && Temporal.Instant.compare(end, start) < 0) return null
    return {
      min: start.subtract({ hours: 2 }),
      max: end ? end.add({ hours: 1 }) : start.add({ hours: 4 })
    }
  } catch {
    return null
  }
}

function localString(instant, zone, fractionalSecondDigits = 'auto') {
  return instant.toZonedDateTimeISO(zone).toPlainDateTime().toString({ fractionalSecondDigits })
}

export function wallTime(original, event) {
  if (!interval(event) || typeof original !== 'string' || !original) return ''
  try {
    const precision = original.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/i)?.[1].length
    return localString(Temporal.Instant.from(original), event.timeZone, precision ?? 'auto')
  } catch {
    return ''
  }
}

export function timeBounds(event) {
  const bounds = interval(event)
  return bounds ? {
    min: localString(bounds.min, event.timeZone),
    max: localString(bounds.max, event.timeZone)
  } : null
}

export function createDrafts(rows, event) {
  const contacts = Object.create(null)
  const contactBaselines = Object.create(null)
  const times = Object.create(null)
  const timeBaselines = Object.create(null)
  for (const row of rows) {
    const contact = contactFor(row)
    const id = contactId(row)
    if (contact && id != null && !Object.hasOwn(contacts, id)) {
      const draft = {
        name: contact.name ?? '',
        emails: (contact.emails ?? []).join(', '),
        phones: (contact.phones ?? []).join(', '),
        zips: [contact.zip_home, ...(contact.zip_other ?? [])].filter(value => value != null && value !== '').join(', ')
      }
      contacts[id] = { ...draft }
      contactBaselines[id] = { ...draft }
    }
    times[row.id] = wallTime(rowTimestamp(row), event)
    timeBaselines[row.id] = times[row.id]
  }
  return { contacts, contactBaselines, times, timeBaselines }
}

// Raw comparison deliberately warns about edits even before normalization/validation.
export function draftDirty(state) {
  return !same(state.contacts, state.contactBaselines) || !same(state.times, state.timeBaselines)
}

export class DraftValidationError extends Error {
  constructor(message, resource, id, field) {
    super(message)
    this.name = 'DraftValidationError'
    this.resource = resource
    this.id = id
    this.field = field
  }
}

function fail(message, resource, id, field) {
  throw new DraftValidationError(message, resource, id, field)
}

function normalizePhones(value) {
  return list(value).map(phone => /^[+\d\s().-]+$/.test(phone) ? phoneDigits(phone) : phone)
}

function contactBody(draft, baseline, id) {
  const body = {}
  if (draft.name !== baseline.name) {
    const name = normalizeName(draft.name)
    if (name !== normalizeName(baseline.name)) {
      const error = validateName(name)
      if (error) fail(error, 'contacts', id, 'name')
      body.name = name
    }
  }
  for (const [field, normalize, validate, storage] of [
    ['emails', value => list(value).map(email => email.toLowerCase()), validateEmail, value => value],
    ['phones', normalizePhones, validatePhone, toStoragePhone],
    ['zips', list, validateZip, value => value]
  ]) {
    if (draft[field] === baseline[field]) continue
    const values = normalize(draft[field])
    if (same(values, normalize(baseline[field]))) continue
    for (const value of values) {
      const error = validate(value)
      if (error) fail(`${field === 'zips' ? 'ZIP' : field}: ${error} Invalid entry: ${value}`, 'contacts', id, field)
    }
    if (field === 'zips') {
      const before = normalize(baseline[field])
      if ((values[0] ?? null) !== (before[0] ?? null)) body.zip_home = values[0] ?? null
      if (!same(values.slice(1), before.slice(1))) body.zip_other = values.slice(1)
    } else {
      body[field] = values.map(storage)
    }
  }
  return body
}

function editedInstant(value, event, id) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/.test(value)) {
    fail('Enter a valid check-in date and time, including the date.', 'checkins', id, 'time')
  }
  let plain
  try {
    plain = Temporal.PlainDateTime.from(value, { overflow: 'reject' })
  } catch {
    fail('Enter a valid check-in date and time.', 'checkins', id, 'time')
  }
  try {
    return plain.toZonedDateTime(event.timeZone, { disambiguation: 'reject' }).toInstant()
  } catch {
    fail('This local time is nonexistent or ambiguous because of daylight saving time. Choose an unambiguous time outside the clock change.', 'checkins', id, 'time')
  }
}

// Throws DraftValidationError before returning any mutations; callers stage only on success.
export function buildMutations(state, rows, event) {
  const mutations = []
  const seen = new Set()
  for (const row of rows) {
    const contact = contactFor(row)
    const id = contactId(row)
    if (contact && id != null && !seen.has(String(id))) {
      seen.add(String(id))
      const draft = state.contacts[id]
      const baseline = state.contactBaselines[id]
      if (draft && baseline) {
        const body = contactBody(draft, baseline, id)
        if (Object.keys(body).length) mutations.push({ resource: 'contacts', id, action: 'PUT', revision: contact.revision, body })
      }
    }
    const value = state.times[row.id]
    if (value === state.timeBaselines[row.id] || value === undefined) continue
    const bounds = interval(event)
    if (!bounds) fail('Time editing requires a valid event timezone and start/end interval.', 'checkins', row.id, 'time')
    const instant = editedInstant(value, event, row.id)
    try {
      if (Temporal.Instant.compare(instant, Temporal.Instant.from(rowTimestamp(row))) === 0) continue
    } catch {
      // An invalid legacy timestamp can still be replaced with a valid one.
    }
    if (Temporal.Instant.compare(instant, bounds.min) < 0 || Temporal.Instant.compare(instant, bounds.max) > 0) {
      fail('Check-in time must be within the inclusive event time bounds (start minus 2 hours through end plus 1 hour, or start plus 4 hours without an end).', 'checkins', row.id, 'time')
    }
    mutations.push({ resource: 'checkins', id: row.id, action: 'PUT', revision: row.revision, body: { submitted_on: instant.toString() } })
  }
  return mutations
}
