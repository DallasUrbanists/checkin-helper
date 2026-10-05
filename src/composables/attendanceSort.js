import { contactFor, rowTimestamp } from './eventDrafts.js'
import { phoneDigits } from './contactUtils.js'
import { Temporal } from '@js-temporal/polyfill'

export const ATTENDANCE_SORT_KEY = 'checkin-helper-attendance-sort'
export const DEFAULT_ATTENDANCE_SORT = Object.freeze({ column: 'time', direction: 'desc' })
const columns = ['name', 'emails', 'phones', 'zip', 'time']
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

function validSort(value) {
  return columns.includes(value?.column) && ['asc', 'desc'].includes(value?.direction)
}

export function readAttendanceSort(storage) {
  try {
    const value = JSON.parse((storage || globalThis.localStorage).getItem(ATTENDANCE_SORT_KEY))
    if (validSort(value)) return { column: value.column, direction: value.direction }
  } catch { return { ...DEFAULT_ATTENDANCE_SORT } }
  return { ...DEFAULT_ATTENDANCE_SORT }
}

export function saveAttendanceSort(value, storage) {
  if (!validSort(value)) return
  try {
    const target = storage || globalThis.localStorage
    target.setItem(ATTENDANCE_SORT_KEY, JSON.stringify({ column: value.column, direction: value.direction }))
  } catch { return }
}

function values(value) {
  return Array.isArray(value) ? value.filter(item => item != null).map(String).filter(item => item.trim()) : []
}

export function orderedEmails(value, direction = 'asc') {
  return values(value).sort((first, second) => collator.compare(first, second) * (direction === 'desc' ? -1 : 1))
}

export function sortAttendance(rows, sort, nameFor = row => contactFor(row)?.name || row.contact_name || '') {
  const choice = validSort(sort) ? sort : DEFAULT_ATTENDANCE_SORT
  const direction = choice.direction === 'desc' ? -1 : 1
  function valueFor(row) {
    const contact = contactFor(row)
    if (choice.column === 'name') return nameFor(row)
    if (choice.column === 'emails') return orderedEmails(contact?.emails, choice.direction)[0]
    if (choice.column === 'phones') return values(contact?.phones).map(phoneDigits).find(Boolean)
    if (choice.column === 'zip') return contact?.zip_home || values(contact?.zip_other)[0]
    try { return Temporal.Instant.from(rowTimestamp(row)).epochNanoseconds } catch { return null }
  }
  return rows.map(row => ({ row, value: valueFor(row) })).sort((first, second) => {
    const firstEmpty = first.value == null || String(first.value).trim() === ''
    const secondEmpty = second.value == null || String(second.value).trim() === ''
    if (firstEmpty || secondEmpty) return Number(firstEmpty) - Number(secondEmpty)
    const compared = choice.column === 'time'
      ? (first.value === second.value ? 0 : first.value < second.value ? -1 : 1)
      : collator.compare(String(first.value), String(second.value))
    return compared * direction
  }).map(item => item.row)
}