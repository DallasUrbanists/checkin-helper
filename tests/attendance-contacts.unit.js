import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveAttendanceContacts } from '../src/composables/attendanceContacts.js'

test('missing contact revisions load canonical values once per contact before drafts', async () => {
  const canonical = { id: 11, name: 'Canonical name', revision: 'contact-revision', emails: [] }
  const rows = [1, 2].map(id => ({ id, contact_id: 11, revision: `checkin-${id}`, contact: { id: 11, name: 'Old name' } }))
  const calls = []
  const result = await resolveAttendanceContacts(rows, async id => { calls.push(id); return canonical })
  assert.deepEqual(calls, [11])
  assert.equal(result[0].contact, canonical)
  assert.equal(result[1].contact, canonical)
  assert.equal(result[0].revision, 'checkin-1')
  assert.equal(rows[0].contact.name, 'Old name')
})

test('already versioned and anonymous contacts require no additional reads', async () => {
  const rows = [{ id: 1, contact_id: 11, contact: { id: 11, revision: 'revision' } }, { id: 2, contact_id: null, contact: null }]
  assert.deepEqual(await resolveAttendanceContacts(rows, () => assert.fail('Unexpected contact read')), rows)
})

test('failed canonical reads do not create a revision paired with stale contact values', async () => {
  await assert.rejects(resolveAttendanceContacts([{ contact_id: 11, contact: { name: 'Old name' } }], async () => { throw new Error('Read failed') }), /Read failed/)
})
