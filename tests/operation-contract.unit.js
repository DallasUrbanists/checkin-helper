import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { canonical, clientActionId, latestCommitted, payloadBytes, recordId } from '../src/composables/operationContract.js'

test('action IDs are UUIDv7 with the original issue time and secure unique randomness', () => {
  const now = 1791090000000
  const first = clientActionId(now)
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(parseInt(first.replace(/-/g, '').slice(0, 12), 16), now)
  assert.notEqual(first, clientActionId(now))
})

test('canonical decimal IDs preserve BIGINT precision and reject unsafe numbers', () => {
  assert.equal(recordId('00017'), '17')
  assert.equal(recordId('9223372036854775807'), '9223372036854775807')
  for (const value of [0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1, '9223372036854775808', null, 'no']) {
    assert.throws(() => recordId(value))
  }
})

test('latest committed order is compared numerically without skipping blocked actions', () => {
  const newest = { status: 'committed', commit_order: '10000000000000000001', undo_availability: 'blocked' }
  assert.equal(latestCommitted([
    { status: 'undone', commit_order: '10000000000000000002' },
    { status: 'committed', commit_order: '9' }, newest,
    { status: 'committed', commit_order: '10000000000000000000' }
  ]), newest)
  assert.equal(latestCommitted([]), null)
})

test('payload accounting matches normalized canonical UTF-8 commands including explicit clears', () => {
  const mutations = [{ resource: 'contacts', id: '17', action: 'PUT', body: {
    name: ' élise ', emails: [' TEST@EXAMPLE.ORG '], phones: ['(214) 555-0100'], zip_other: []
  } }, { resource: 'checkins', id: '91', action: 'DELETE' }]
  const begin = { client_action_id: clientActionId(), source: 'event-view', action_type: 'update', event_id: '1',
    manifest: mutations.map(item => ({ resource: item.resource, record_id: item.id, action: item.action })).reverse() }
  const expected = [
    { ...begin, manifest: [...begin.manifest].reverse() },
    { resource: 'contacts', record_id: '17', action: 'PUT', command: {
      name: 'ÉLISE', emails: ['test@example.org'], phones: ['+1-214-555-0100'], zip_other: null
    } },
    { resource: 'checkins', record_id: '91', action: 'DELETE', command: {} }
  ].reduce((total, value) => total + Buffer.byteLength(canonical(value), 'utf8'), 0)
  assert.equal(payloadBytes(begin, mutations), expected)
})
