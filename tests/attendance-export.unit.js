import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attendanceFilename, serializeAttendance } from '../src/composables/attendanceExport.js'

const rows = [{
  id: 1, contact_id: 11, submitted_on: '2026-10-05T23:35:00Z',
  contact: { name: 'Alice "A", Adams', emails: ['alice@example.org', 'other@example.org'], phones: ['+12145550199'], zip_home: '75201', zip_other: ['75202'], firebase_uid: 'private', roles: ['staff'] }
}, { id: 2, contact: null }]

test('JSON exports explicit attendance fields and safely handles missing contacts', () => {
  const records = JSON.parse(serializeAttendance(rows, 'json'))
  assert.deepEqual(records[0], {
    checkin_id: 1, contact_id: 11, name: 'Alice "A", Adams', emails: ['alice@example.org', 'other@example.org'],
    phones: ['2145550199'], zip_home: '75201', zip_other: ['75202'], submitted_on: '2026-10-05T23:35:00Z'
  })
  assert.equal(records[1].name, 'Anonymous attendee')
  assert.deepEqual(records[1].emails, [])
  assert.equal(serializeAttendance([], 'json'), '[]')
})

test('CSV escapes quotes, commas, newlines and spreadsheet formulas', () => {
  const csv = serializeAttendance(rows, 'csv')
  assert.ok(csv.startsWith('checkin_id,contact_id,name,emails,phones,zip_home,zip_other,submitted_on\r\n'))
  assert.ok(csv.includes('"Alice ""A"", Adams"'))
  assert.ok(csv.includes('"alice@example.org, other@example.org"'))
  assert.ok(csv.includes('"2145550199"'))
  assert.ok(serializeAttendance([{ contact_name: '=1+1\nName' }], 'csv').includes('"\'=1+1\nName"'))
})

test('CSV leaves integer IDs unquoted and missing IDs empty', () => {
  const lines = serializeAttendance(rows, 'csv').split('\r\n')
  assert.ok(lines[1].startsWith('1,11,"Alice ""A"", Adams",'))
  assert.ok(lines[2].startsWith('2,,"Anonymous attendee",'))
  const stringIds = [{ id: '19', contact_id: '13', contact_name: 'ERIC' }]
  assert.ok(serializeAttendance(stringIds, 'csv').split('\r\n')[1].startsWith('19,13,"ERIC",'))
})

test('CSV and JSON export digits-only phones without a leading US country code', () => {
  const phones = ['+1-214-555-0199', '+12145550199', '1 (214) 555-0199', '(214) 555-0199', '2145550199']
  const phoneRows = [{ contact: { phones } }]
  const expected = phones.map(() => '2145550199')
  assert.deepEqual(JSON.parse(serializeAttendance(phoneRows, 'json'))[0].phones, expected)
  assert.ok(serializeAttendance(phoneRows, 'csv').includes(`"${expected.join(', ')}"`))
  assert.deepEqual(phoneRows[0].contact.phones, phones)
})

test('email merge expands all nonempty emails and skips contacts without emails', () => {
  assert.equal(serializeAttendance(rows, 'email'), 'Alice "A", Adams <alice@example.org>, Alice "A", Adams <other@example.org>')
  assert.equal(serializeAttendance([{ contact: { name: 'No Email', emails: [''] } }], 'email'), '')
})

test('filenames use event-local start time, midnight and a safe title slug', () => {
  const event = { start: new Date('2026-10-05T23:30:00Z'), timeZone: 'America/Chicago', title: 'Redbird South Oak Cliff Hyperlocal Conversation' }
  assert.equal(attendanceFilename(event, 'csv'), 'checkins-20261005183000-redbird-south-oak-cliff-hyperlocal-conversation.csv')
  assert.equal(attendanceFilename({ ...event, start: new Date('2026-10-06T05:00:00Z'), title: 'Caf\u00e9 / Walk!' }, 'json'), 'checkins-20261006000000-cafe-walk.json')
  assert.equal(attendanceFilename({ ...event, timeZone: undefined, title: '' }, 'json'), 'checkins-20261005233000-untitled-event.json')
})