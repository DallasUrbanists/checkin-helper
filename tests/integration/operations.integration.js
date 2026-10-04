import { test as base, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'

const API = 'http://127.0.0.1:4196'
const HARNESS = '/checkin-helper/tests/integration/adapter.html'
const test = base.extend({
  context: async ({ context }, use) => {
    const blocked = []
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.hostname === '127.0.0.1' && ['4186', '4196'].includes(url.port)) await route.continue()
      else { blocked.push(url.origin); await route.abort('blockedbyclient') }
    })
    await use(context)
    expect(blocked, 'The integration browser must never request production or external services').toEqual([])
  }
})

async function state(request) {
  const response = await request.get(`${API}/__integration/state`)
  expect(response.ok()).toBe(true)
  return response.json()
}
async function open(page, uid = 'staff-a') {
  await page.addInitScript(value => {
    window.sessionStorage.setItem('checkin-test-auth', JSON.stringify({ uid: value, claims: { staff: value.startsWith('staff-') } }))
  }, uid)
  await page.goto(HARNESS)
  await page.waitForFunction(() => window.integration?.operations.enabled.value)
}
async function invoke(page, method, input, options) {
  return page.evaluate(async ({ method, input, options }) => {
    try { return { value: await window.integration.operations[method](input, options) } }
    catch (error) { return { error: { status: error.status, code: error.code, uncertain: error.uncertain } } }
  }, { method, input, options })
}
async function read(page, path, options) {
  return page.evaluate(async ({ path, options }) => {
    try { return { value: await window.integration.apiRequest(path, options) } }
    catch (error) { return { error: { status: error.status, code: error.code } } }
  }, { path, options })
}
async function mutations(page, id = '1', name = 'Alice saved', stamp = '2026-10-03T18:05:00.456789Z') {
  const checkins = await page.evaluate(async () => {
    const rows = await window.integration.apiRequest('/api/checkins?event_id=1&include_contact=full')
    return window.integration.resolveAttendanceContacts(rows, id => window.integration.apiRequest(`/api/contacts/${id}`))
  })
  const row = checkins.find(item => String(item.id) === id)
  expect(row.contact.revision).toBeTruthy()
  return [
    { resource: 'contacts', id, action: 'PUT', revision: row.contact.revision,
      body: { name, emails: ['new@example.invalid'], phones: ['2145550199'], zip_home: '75203', zip_other: [] } },
    { resource: 'checkins', id, action: 'PUT', revision: row.revision, body: { submitted_on: stamp } }
  ]
}
async function execute(page, items, actionType = 'update') {
  return invoke(page, 'execute', { actionType, eventId: '1', mutations: items })
}
async function history(page) {
  return page.evaluate(() => window.integration.operations.history.value)
}
function rows(snapshot) { return { contacts: snapshot.contacts, checkins: snapshot.checkins } }

test.beforeEach(async ({ request }) => {
  const response = await request.post(`${API}/__integration/reset`)
  expect(response.ok()).toBe(true)
})

test('authenticated discovery gates the production adapter; combined save and keyboard Undo restore exact values', async ({ page, request }) => {
  await page.goto(HARNESS)
  await page.waitForFunction(() => window.integration)
  expect(await page.evaluate(() => window.integration.operations.enabled.value)).toBe(false)
  const denied = await read(page, '/api/operation-groups?source=event-view')
  expect(denied.error.status).toBe(401)
  await page.evaluate(() => window.dispatchEvent(new window.CustomEvent('checkin-test-auth', { detail: { uid: 'staff-a', claims: { staff: true } } })))
  await page.waitForFunction(() => window.integration.operations.enabled.value)
  const before = await state(request)
  const outcome = await execute(page, await mutations(page))
  expect(outcome.error).toBeUndefined()
  expect(outcome.value).toMatchObject({ status: 'committed', source: 'event-view', affected_record_count: 2 })
  const saved = await state(request)
  expect(saved.contacts[0]).toMatchObject({ name: 'ALICE SAVED', emails: ['new@example.invalid'], phones: ['+1-214-555-0199'], zip_home: '75203', zip_other: null, roles: before.contacts[0].roles, firebase_uid: before.contacts[0].firebase_uid })
  expect(saved.checkins[0].submitted_on).toContain('18:05:00.456789')
  expect(saved.contacts[0].created_on).toBe(before.contacts[0].created_on)
  expect(saved.contacts[1]).toEqual(before.contacts[1])
  expect(saved.checkins[1]).toEqual(before.checkins[1])
  expect(saved.groups).toHaveLength(1)
  const begin = saved.calls.find(call => call.method === 'POST' && call.path === '/api/operation-groups')
  expect(begin.body.client_action_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  expect(begin.body.manifest).toEqual([{ resource: 'contacts', record_id: '1', action: 'PUT' }, { resource: 'checkins', record_id: '1', action: 'PUT' }])
  const stages = saved.calls.filter(call => call.group)
  expect(stages).toHaveLength(2)
  for (const stage of stages) {
    expect(stage.match).toMatch(/^"[0-9a-f-]+:\d+"$/)
    expect(stage.group).toBe(outcome.value.group_id)
    expect(stage.key).toBeTruthy()
  }
  expect((await history(page)).map(item => item.group_id)).toEqual([outcome.value.group_id])
  const undone = await invoke(page, 'undo', outcome.value, { keyboard: true })
  expect(undone.error).toBeUndefined()
  expect(undone.value.status).toBe('undone')
  const after = await state(request)
  expect(rows(after)).toEqual(rows(before))
  expect(after.calls.find(call => call.path.endsWith('/undo')).body).toEqual({
    source: 'event-view', expected_latest_group_id: outcome.value.group_id, expected_latest_commit_order: outcome.value.commit_order
  })
  expect((await history(page))[0].status).toBe('undone')
})

test('real attendance reads confirm only the signed-in self name and redact private contact fields', async ({ page }) => {
  await page.addInitScript(() => window.sessionStorage.setItem('checkin-test-auth', JSON.stringify({ uid: 'member', claims: {} })))
  await page.goto(HARNESS)
  await page.waitForFunction(() => window.integration)
  const response = await read(page, '/api/checkins?event_id=1&include_contact=full')
  expect(response.error).toBeUndefined()
  const self = response.value.find(row => row.is_self)
  expect(String(self.id)).toBe('2')
  expect(self.contact.name).toBe('BOB ORIGINAL')
  expect(response.value.find(row => String(row.id) === '1').is_self).toBe(false)
  expect(response.value.find(row => String(row.id) === '1').contact.name).not.toBe('ALICE ORIGINAL')
  for (const row of response.value) {
    expect(row.contact.emails).toBeNull()
    expect(row.contact.phones).toBeNull()
    expect(row.contact.zip_other).toBeNull()
    expect(row.contact.roles).toBeNull()
    expect(row.contact.firebase_uid ?? null).toBeNull()
  }
  expect(await page.evaluate(() => window.integration.operations.enabled.value)).toBe(false)
})

test('delete and Undo restore every check-in, exact microseconds, nulls, and ordered contact lists', async ({ page, request }) => {
  await open(page)
  const before = await state(request)
  const listed = await read(page, '/api/checkins?event_id=1&include_contact=full')
  const items = listed.value.map(row => ({ resource: 'checkins', id: String(row.id), revision: row.revision, action: 'DELETE' }))
  const deleted = await execute(page, items, 'delete')
  expect(deleted.error).toBeUndefined()
  expect(deleted.value.affected_record_count).toBe(2)
  const empty = await read(page, '/api/checkins?event_id=1&include_contact=full')
  expect(empty.value).toEqual([])
  expect((await state(request)).contacts).toEqual(before.contacts)
  const undone = await invoke(page, 'undo', deleted.value)
  expect(undone.error).toBeUndefined()
  expect(rows(await state(request))).toEqual(rows(before))
  const restored = await read(page, '/api/checkins?event_id=1&include_contact=full')
  expect(restored.value.map(row => String(row.id))).toEqual(listed.value.map(row => String(row.id)))
  for (const row of restored.value) {
    expect(row.revision).not.toBe(listed.value.find(item => item.id === row.id).revision)
    expect(row.contact).toEqual(listed.value.find(item => item.id === row.id).contact)
  }
})

test('a revision conflict after staging rejects the entire combined commit without partial contact writes', async ({ page, request }) => {
  await open(page)
  const before = await state(request)
  const items = await mutations(page)
  expect((await request.post(`${API}/__integration/conflict`)).ok()).toBe(true)
  const outcome = await execute(page, items)
  expect(outcome.error).toMatchObject({ status: 409, code: 'REVISION_CONFLICT' })
  const after = await state(request)
  expect(after.contacts).toEqual(before.contacts)
  expect(after.checkins[1]).toEqual(before.checkins[1])
  expect(after.checkins[0].submitted_on).toContain('18:02:00.777777')
  expect(after.groups).toHaveLength(1)
  expect(after.groups[0].state).toBe('cancelled')
  expect(await history(page)).toEqual([])
  expect(await page.evaluate(() => window.integration.operations.pending.value)).toBeNull()
})

test('account changes clear local history; server metadata and Undo never cross owners', async ({ page, request }) => {
  await open(page, 'staff-a')
  const first = await execute(page, await mutations(page))
  expect(first.error).toBeUndefined()
  await page.evaluate(() => window.dispatchEvent(new window.CustomEvent('checkin-test-auth', { detail: { uid: 'staff-b', claims: { staff: true }, delay: 100 } })))
  expect(await page.evaluate(() => ({ enabled: window.integration.operations.enabled.value, history: window.integration.operations.history.value }))).toEqual({ enabled: false, history: [] })
  await page.waitForFunction(() => window.integration.operations.enabled.value)
  expect(await history(page)).toEqual([])
  expect((await read(page, `/api/operation-groups/${first.value.group_id}`)).error.status).toBe(404)
  expect((await read(page, `/api/operation-groups/${first.value.group_id}/undo`, { method: 'POST', body: {}, headers: { 'Idempotency-Key': randomUUID() } })).error.status).toBe(404)
  const second = await execute(page, await mutations(page, '2', 'Bob saved', '2026-10-03T18:06:00.112233Z'))
  expect(second.error).toBeUndefined()
  expect((await history(page)).map(item => item.group_id)).toEqual([second.value.group_id])
  await page.evaluate(() => window.dispatchEvent(new window.CustomEvent('checkin-test-auth', { detail: { uid: 'staff-a', claims: { staff: true } } })))
  await page.waitForFunction(() => window.integration.operations.enabled.value)
  expect((await history(page)).map(item => item.group_id)).toEqual([first.value.group_id])
  expect((await state(request)).groups.map(item => item.owner_uid).sort()).toEqual(['staff-a', 'staff-b'])
})

test('another browser commit makes stale keyboard latest Undo fail, then refreshed source-wide Undo succeeds', async ({ page, context, request }) => {
  await open(page)
  const before = await state(request)
  const first = await execute(page, await mutations(page))
  expect(first.error).toBeUndefined()
  const other = await context.newPage()
  await open(other)
  const second = await execute(other, await mutations(other, '2', 'Bob latest', '2026-10-03T18:07:00.223344Z'))
  expect(second.error).toBeUndefined()
  const committed = rows(await state(request))
  const stale = await invoke(page, 'undo', first.value, { keyboard: true })
  expect(stale.error).toMatchObject({ status: 409, code: 'LATEST_ACTION_CHANGED' })
  expect(rows(await state(request))).toEqual(committed)
  expect((await history(page)).map(item => item.group_id)).toEqual([second.value.group_id, first.value.group_id])
  expect((await invoke(page, 'undo', second.value, { keyboard: true })).error).toBeUndefined()
  expect((await invoke(page, 'undo', first.value, { keyboard: true })).error).toBeUndefined()
  expect(rows(await state(request))).toEqual(rows(before))
  expect((await state(request)).groups.every(item => item.state === 'undone')).toBe(true)
  await other.close()
})
