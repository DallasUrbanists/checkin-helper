import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ATTENDANCE_SORT_KEY, DEFAULT_ATTENDANCE_SORT, orderedEmails, readAttendanceSort, saveAttendanceSort, sortAttendance } from '../src/composables/attendanceSort.js'

const rows = [
  { id: 1, submitted_on: '2026-10-05T23:00:00Z', contact: { name: 'Bob', emails: ['z@example.org', 'a@example.org'], phones: ['+1-469-555-0199'], zip_home: '75202' } },
  { id: 2, submitted_on: '2026-10-05T23:30:00Z', contact: { name: 'Alice', emails: ['b@example.org'], phones: ['+1-214-555-0199'], zip_home: '75201' } },
  { id: 3, submitted_on: 'invalid', contact: null }
]
const ids = values => values.map(row => row.id)

test('default sort is latest first, invalid times last, without mutating attendance', () => {
  assert.deepEqual(ids(sortAttendance(rows, DEFAULT_ATTENDANCE_SORT)), [2, 1, 3])
  assert.deepEqual(ids(sortAttendance(rows, { column: 'time', direction: 'asc' })), [1, 2, 3])
  assert.deepEqual(ids(rows), [1, 2, 3])
  assert.deepEqual(ids(sortAttendance([
    { id: 1, submitted_on: '2026-10-05T23:00:00.123456Z' },
    { id: 2, submitted_on: '2026-10-05T18:00:00.123457-05:00' }
  ], DEFAULT_ATTENDANCE_SORT)), [2, 1])
})

test('text columns toggle direction while missing contacts stay last', () => {
  for (const column of ['name', 'phones', 'zip']) {
    assert.deepEqual(ids(sortAttendance(rows, { column, direction: 'asc' })), [2, 1, 3])
    assert.deepEqual(ids(sortAttendance(rows, { column, direction: 'desc' })), [1, 2, 3])
  }
  assert.deepEqual(ids(sortAttendance(rows, { column: 'name', direction: 'asc' }, row => row.id === 1 ? 'AA' : row.id === 2 ? 'BB' : '')), [1, 2, 3])
})

test('email values and rows share sort direction, using the first displayed email', () => {
  assert.deepEqual(orderedEmails(rows[0].contact.emails), ['a@example.org', 'z@example.org'])
  assert.deepEqual(orderedEmails(rows[0].contact.emails, 'desc'), ['z@example.org', 'a@example.org'])
  assert.deepEqual(ids(sortAttendance(rows, { column: 'emails', direction: 'asc' })), [1, 2, 3])
  assert.deepEqual(ids(sortAttendance(rows, { column: 'emails', direction: 'desc' })), [1, 2, 3])
  assert.deepEqual(rows[0].contact.emails, ['z@example.org', 'a@example.org'])
})

test('sort cache stores preferences only and tolerates invalid or unavailable storage', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  assert.deepEqual(readAttendanceSort(storage), DEFAULT_ATTENDANCE_SORT)
  saveAttendanceSort({ column: 'name', direction: 'asc', contact: 'private' }, storage)
  assert.equal(values.get(ATTENDANCE_SORT_KEY), '{"column":"name","direction":"asc"}')
  assert.deepEqual(readAttendanceSort(storage), { column: 'name', direction: 'asc' })
  for (const invalid of ['not json', '{}', '{"column":"unknown","direction":"asc"}', '{"column":"name","direction":"sideways"}']) {
    values.set(ATTENDANCE_SORT_KEY, invalid)
    assert.deepEqual(readAttendanceSort(storage), DEFAULT_ATTENDANCE_SORT)
  }
  const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  assert.deepEqual(readAttendanceSort(blocked), DEFAULT_ATTENDANCE_SORT)
  assert.doesNotThrow(() => saveAttendanceSort(DEFAULT_ATTENDANCE_SORT, blocked))
})