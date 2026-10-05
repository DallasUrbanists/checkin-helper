import { test, expect } from '@playwright/test'
import { API } from './helpers.js'
import { attendees, mockEventOperations, setAuth } from './event-operations-mock.js'

const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }

for (const response of [{ status: 404, body: { error: 'Not found' } }, { status: 200, body: { data: [] } }]) {
  test(`atomic actions fail closed for ${response.status === 404 ? 'missing' : 'incompatible'} history`, async ({ page }) => {
    const state = await mockEventOperations(page)
    let available = false
    await page.route(`${API}/api/operation-groups?**`, route => available ? route.fallback() :
      route.fulfill({ status: response.status, headers, contentType: 'application/json', body: JSON.stringify(response.body) }))
    await page.goto('/#/events/1')
    await expect(page.getByRole('link', { name: 'ALICE ADAMS' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit attendees', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Retry connection' })).toBeVisible()
    expect(state.calls.filter(call => call.method !== 'GET')).toHaveLength(0)
    available = true
    await page.getByRole('button', { name: 'Retry connection' }).click()
    await expect(page.getByRole('button', { name: 'Edit attendees', exact: true })).toBeEnabled()
  })
}

test('contact edits resolve missing embedded revisions from canonical contact reads', async ({ page }) => {
  const state = await mockEventOperations(page)
  await page.route(`${API}/api/checkins?**`, route => route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ data: state.rows.map(row => ({ ...row, contact: { ...row.contact, revision: undefined, name: 'Stale embedded name' } })) }) }))
  await page.goto('/#/events/1')
  await expect(page.getByRole('link', { name: 'ALICE ADAMS' })).toBeVisible()
  await page.getByRole('button', { name: 'Edit attendees', exact: true }).click()
  await page.getByLabel('Name for Alice Adams', { exact: true }).fill('Alice Fixed')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('link', { name: 'ALICE FIXED' })).toBeVisible()
  expect(state.groups).toHaveLength(1)
  const stage = state.calls.find(call => call.method === 'PUT')
  expect(stage.headers['if-match']).toBe('"contact-0-v1"')
})

test('stale account capability response cannot enable actions after role loss', async ({ page }) => {
  await mockEventOperations(page)
  let release
  const barrier = new Promise(resolve => { release = resolve })
  await page.route(`${API}/api/operation-groups?**`, async route => {
    await barrier
    return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ items: [], next_cursor: null }) })
  })
  await page.goto('/#/events/1')
  await expect(page.getByRole('button', { name: 'Edit attendees', exact: true })).toBeDisabled()
  await setAuth(page, { uid: 'nonstaff' })
  release()
  await expect(page.getByRole('button', { name: 'Edit attendees', exact: true })).toHaveCount(0)
})

test('expired pagination cursor restarts discovery once', async ({ page }) => {
  const state = await mockEventOperations(page)
  let first = true
  await page.route(`${API}/api/operation-groups?**`, route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor')
    if (cursor) return route.fulfill({ status: 400, headers, contentType: 'application/json', body: JSON.stringify({ error: 'INVALID_CURSOR' }) })
    if (first) {
      first = false
      return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ items: [], next_cursor: 'expired' }) })
    }
    return route.fallback()
  })
  await page.goto('/#/events/1')
  await expect(page.getByRole('button', { name: 'Edit attendees', exact: true })).toBeEnabled()
  expect(state.calls.some(call => call.method !== 'GET')).toBe(false)
})

test('oversized remove is rejected before begin without splitting the action', async ({ page }) => {
  const rows = Array.from({ length: 101 }, (_, index) => ({ ...attendees()[0], id: index + 1 }))
  const state = await mockEventOperations(page, { rows })
  await page.goto('/#/events/1')
  await page.getByLabel('Select all attendees').check()
  await page.getByRole('toolbar').getByRole('button', { name: 'Remove selected', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove attendees', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('exceeds 100 targets or 1 MiB')
  expect(state.groups).toHaveLength(0)
  expect(state.rows).toHaveLength(101)
  await expect(page.getByLabel('Select all attendees')).toBeChecked()
})
