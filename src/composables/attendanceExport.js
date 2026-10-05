import { contactFor, rowTimestamp } from './eventDrafts.js'
import { phoneDigits } from './contactUtils.js'

function list(value) {
  return Array.isArray(value) ? value.filter(item => item != null).map(String) : []
}

export function attendanceRecords(rows) {
  return rows.map(row => {
    const contact = contactFor(row)
    return {
      checkin_id: row.id ?? null,
      contact_id: row.contact_id ?? contact?.id ?? null,
      name: contact?.name || row.contact_name || 'Anonymous attendee',
      emails: list(contact?.emails),
      phones: list(contact?.phones).map(phoneDigits),
      zip_home: contact?.zip_home || '',
      zip_other: list(contact?.zip_other),
      submitted_on: rowTimestamp(row)
    }
  })
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(', ') : String(value ?? '')
  const safe = /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export function serializeAttendance(rows, format) {
  const records = attendanceRecords(rows)
  if (format === 'json') return JSON.stringify(records, null, 2)
  if (format === 'email') {
    return records.flatMap(record => record.emails.filter(email => email.trim()).map(email => `${record.name} <${email}>`)).join(', ')
  }
  if (format !== 'csv') throw new Error('Unsupported attendance export format.')
  const fields = ['checkin_id', 'contact_id', 'name', 'emails', 'phones', 'zip_home', 'zip_other', 'submitted_on']
  return [fields.join(','), ...records.map(record => [
    record.checkin_id ?? '', record.contact_id ?? '', ...fields.slice(2).map(field => csvCell(record[field]))
  ].join(','))].join('\r\n')
}

export function attendanceFilename(event, extension) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: event.timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(event.start)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const timestamp = ['year', 'month', 'day', 'hour', 'minute', 'second'].map(field => values[field]).join('')
  const slug = String(event.title || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled-event'
  return `checkins-${timestamp}-${slug}.${extension}`
}