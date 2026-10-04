import { test, expect } from '@playwright/test'
import { attendees, eventData, mockEventOperations, setAuth } from './event-operations-mock.js'
import { API } from './helpers.js'

const go = page => page.goto('/#/events/1')

test('no candidate leaves Ctrl-Z default alone; editable descendants and redo stay native', async ({ page }) => {
  await mockEventOperations(page)
  await go(page)
  const notPrevented = await page.evaluate(() => document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })))
  expect(notPrevented).toBe(true)
})

test('stale privileged attendance response cannot survive role loss or event route change', async ({ page }) => {
  await mockEventOperations(page)
  let release
  const barrier = new Promise(resolve => { release = resolve })
  await page.route(`${API}/api/checkins?**`, async route => {
    if (new URL(route.request().url()).searchParams.get('event_id') === '1') {
      await barrier
      return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ data: attendees() }) })
    }
    return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ data: [{ id: 7, submitted_on: eventData.start_at, contact: { name: 'Public Second', zip_home: '75205' } }] }) })
  })
  await go(page)
  await expect(page.getByText('Loading check-ins...')).toBeVisible()
  await setAuth(page, { uid: 'public-b' })
  await page.evaluate(() => { window.location.hash = '#/events/2' })
  await expect(page.locator('tbody')).toContainText('PS')
  release()
  await page.waitForTimeout(100)
  await expect(page.locator('tbody')).not.toContainText('example.org')
  await expect(page.locator('tbody')).not.toContainText('ALICE')
})

test('anonymous contact fields are disabled but timestamp and removal remain supported', async ({ page }) => {
  const rows = [{ id: 1, contact_id: null, contact: null, revision: 'v1', submitted_on: '2026-11-01T15:30:00.123456Z' }]
  const state = await mockEventOperations(page, { rows })
  await go(page)
  await page.getByRole('button', { name: 'Edit contacts' }).click()
  await expect(page.getByLabel('Name unavailable', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('Emails unavailable', { exact: true })).toBeDisabled()
  await page.getByLabel('Time for Anonymous attendee', { exact: true }).fill('2026-11-01T10:00')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('button', { name: 'Edit contacts' })).toBeVisible()
  expect(state.groups[0].begin.manifest).toEqual([{ resource: 'checkins', id: '1', action: 'PUT' }])
})

test('history is paginated beyond 100 entries and opaque order stays exact', async ({ page }) => {
  const state = await mockEventOperations(page)
  for (let index = 1; index <= 105; index++) {
    state.groups.push({ group_id: `retained-${index}`, owner: 'Bearer isolated-test-staff-a', status: 'committed', before: attendees(), receipt: {
      group_id: `retained-${index}`, source: 'event-view', commit_order: `900719925474099${String(index).padStart(3, '0')}`,
      client_action_id: `old-${index}`, action_type: 'update', event_id: '1', status: 'committed', undo_availability: 'eligible', undo_expires_at: new Date(Date.now() + 86400000).toISOString()
    } })
  }
  await go(page)
  await expect.poll(() => state.calls.filter(c => c.method === 'GET' && c.path === '/api/operation-groups').length).toBeGreaterThanOrEqual(2)
  await page.keyboard.press('Control+z')
  await expect.poll(() => state.groups.at(-1).status).toBe('undone')
  expect(state.calls.find(c => c.path.endsWith('/undo')).body.expected_latest_commit_order).toBe('900719925474099105')
})

test('reload after lost commit discovers Undo without pending identifiers or snapshots', async ({ page }) => {
  const state = await mockEventOperations(page, { lostCommit: true })
  await go(page)
  await page.getByRole('button', { name: 'Edit contacts' }).click()
  await page.getByLabel('Name for Alice Adams', { exact: true }).fill('Alice Updated')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('button', { name: 'Retry recovery' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: 'ALICE UPDATED' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry recovery' })).toHaveCount(0)
  await page.keyboard.press('Control+z')
  await expect(page.getByRole('link', { name: 'ALICE ADAMS' })).toBeVisible()
  expect(state.groups).toHaveLength(1)
})

test.describe('event timezone differs from device', () => {
  test.use({ timezoneId: 'Asia/Tokyo' })
  test('display and draft use Chicago rather than Tokyo', async ({ page }) => {
    await mockEventOperations(page)
    await go(page)
    await expect(page.locator('tbody tr').first()).toContainText('9:30 AM CST')
    await page.getByRole('button', { name: 'Edit contacts' }).click()
    await expect(page.getByLabel('Time for Alice Adams', { exact: true })).toHaveValue('2026-11-01T09:30:00.123456')
  })
})
