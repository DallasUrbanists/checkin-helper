import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMutations, createDrafts, draftDirty, timeBounds, wallTime } from '../src/composables/eventDrafts.js'

const event = { start: new Date('2026-11-01T15:00:00Z'), end: new Date('2026-11-01T18:00:00Z'), timeZone: 'America/Chicago' }
const rows = () => [{ id: 1, contact_id: 11, revision: 'c1', submitted_on: '2026-11-01T15:30:00.123456Z', contact: { id: 11, revision: 'p1', name: 'Alice Adams', emails: ['a@example.org'], phones: ['+1-214-555-0199'], zip_home: '75201', zip_other: ['75202'], roles: ['staff'], firebase_uid: 'secret' } }]
function change(field, value, source = rows(), timing = event) {
  const draft = createDrafts(source, timing)
  draft.contacts[11][field] = value
  return buildMutations(draft, source, timing)
}

test('equivalent email/phone/name/list whitespace creates no mutations', () => {
  for (const [field, value] of [['name', '  Alice   Adams  '], ['emails', ' A@EXAMPLE.ORG '], ['phones', '(214) 555-0199'], ['zips', ' 75201, 75202, ']]) assert.deepEqual(change(field, value), [])
})
test('changed field only and explicit clears never carry protected fields', () => {
  assert.deepEqual(change('name', 'Alice Updated')[0].body, { name: 'Alice Updated' })
  assert.deepEqual(change('emails', '')[0].body, { emails: [] })
  assert.deepEqual(change('phones', '')[0].body, { phones: [] })
  assert.deepEqual(change('zips', '')[0].body, { zip_home: null, zip_other: [] })
  assert.deepEqual(change('zips', ', 75203, 75204')[0].body, { zip_home: '75203', zip_other: ['75204'] })
})
test('invalid entries rejected rather than truncation or silent sanitizing', () => {
  for (const [field, value] of [['emails', 'valid@example.org, bad'], ['emails', 'bad space@example.org'], ['phones', '214555019999'], ['phones', 'abc2145550199'], ['zips', '752011'], ['name', '']]) assert.throws(() => change(field, value))
})
test('unchanged legacy fields and timestamps are preserved during unrelated edits', () => {
  const source = rows()
  Object.assign(source[0].contact, { emails: ['legacy'], phones: ['old'], zip_home: 'legacy' })
  source[0].submitted_on = '2000-01-01T00:00:00.123456789Z'
  assert.deepEqual(change('name', 'Alice Updated', source)[0].body, { name: 'Alice Updated' })
  const draft = createDrafts(source, event)
  assert.deepEqual(buildMutations(draft, source, event), [])
})
test('shared contacts and independent timestamps generate exact targets', () => {
  const source = rows()
  source.push({ ...source[0], id: 2, revision: 'c2' })
  const draft = createDrafts(source, event)
  draft.contacts[11].name = 'Alice Updated'
  draft.times[1] = '2026-11-01T10:45'
  draft.times[2] = '2026-11-01T11:00'
  assert.equal(draftDirty(draft), true)
  assert.equal(Object.keys(draft.contacts).length, 1)
  const result = buildMutations(draft, source, event)
  assert.deepEqual(result.map(m => [m.resource, m.id]), [['contacts', 11], ['checkins', 1], ['checkins', 2]])
})
test('event timezone, exact original precision, equivalent time no-op', () => {
  assert.equal(wallTime(rows()[0].submitted_on, event), '2026-11-01T09:30:00.123456')
  const source = rows()
  const draft = createDrafts(source, event)
  draft.times[1] = '2026-11-01T09:30:00.123456000'
  assert.deepEqual(buildMutations(draft, source, event), [])
  assert.equal(source[0].submitted_on, '2026-11-01T15:30:00.123456Z')
})
test('inclusive bounds and no-end fallback reject one nanosecond outside', () => {
  assert.deepEqual(timeBounds(event), { min: '2026-11-01T07:00:00', max: '2026-11-01T13:00:00' })
  for (const time of ['2026-11-01T07:00', '2026-11-01T13:00']) {
    const source = rows(); const draft = createDrafts(source, event); draft.times[1] = time
    assert.equal(buildMutations(draft, source, event).length, 1)
  }
  for (const time of ['2026-11-01T06:59:59.999999999', '2026-11-01T13:00:00.000000001']) {
    const source = rows(); const draft = createDrafts(source, event); draft.times[1] = time
    assert.throws(() => buildMutations(draft, source, event), /inclusive/)
  }
  assert.equal(timeBounds({ ...event, end: null }).max, '2026-11-01T13:00:00')
})
test('unusable intervals disable time editing but allow contact edits and null contacts', () => {
  for (const timing of [{ ...event, timeZone: undefined }, { ...event, timeZone: 'No/Zone' }, { ...event, end: new Date('2020-01-01') }, { ...event, start: new Date('invalid') }]) {
    assert.equal(timeBounds(timing), null)
    assert.equal(change('name', 'Alice Updated', rows(), timing).length, 1)
  }
  const source = [{ id: 1, contact: null, revision: 'c1', submitted_on: rows()[0].submitted_on }]
  const draft = createDrafts(source, event)
  assert.equal(Object.keys(draft.contacts).length, 0)
  draft.times[1] = '2026-11-01T10:00'
  assert.equal(buildMutations(draft, source, event)[0].resource, 'checkins')
})
test('DST ambiguity and nonexistent wall-clock times explicitly rejected', () => {
  for (const [start, time] of [['2026-11-01T06:00:00Z', '2026-11-01T01:30'], ['2026-03-08T07:00:00Z', '2026-03-08T02:30']]) {
    const timing = { start: new Date(start), end: null, timeZone: 'America/Chicago' }
    const source = rows(); const draft = createDrafts(source, timing); draft.times[1] = time
    assert.throws(() => buildMutations(draft, source, timing), /nonexistent or ambiguous/)
  }
})
test('multi-day inputs include dates', () => {
  assert.equal(timeBounds({ ...event, end: new Date('2026-11-03T18:00:00Z') }).max, '2026-11-03T13:00:00')
})
