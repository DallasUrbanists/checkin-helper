import { test, expect } from '@playwright/test'
import { attendees, mockEventOperations, setAuth } from './event-operations-mock.js'

const open = page => page.goto('/#/events/1')
const edit = page => page.getByRole('button', { name: 'Edit contacts', exact: true }).click()
const save = page => page.getByRole('button', { name: 'Save changes', exact: true }).click()
const mutations = state => state.calls.filter(c => ['PUT', 'DELETE'].includes(c.method) && /\/api\/(contacts|checkins)\//.test(c.path))

 test('staff lists full links, private fields, formatted phones and home ZIP first', async ({ page }) => {
  await mockEventOperations(page)
  await open(page)
  await expect(page.locator('thead th')).toHaveText(['', 'Name', 'Email', 'Phone', 'Zip', 'Time'])
  await expect(page.getByRole('link', { name: 'ALICE ADAMS' })).toHaveAttribute('href', '#/contacts/11')
  await expect(page.locator('tbody tr').first()).toContainText('person0@example.org, second0@example.org')
  await expect(page.locator('tbody tr').first()).toContainText('(214) 555-0199')
  await expect(page.locator('tbody tr').first().locator('strong')).toHaveText('75201')
  await expect(page.locator('tbody tr').first()).not.toHaveAttribute('role', 'link')
})

test('public remains redacted; only server-confirmed self links full name; null contact safe', async ({ page }) => {
  const rows = attendees()
  rows[1].is_self = true
  rows[3].contact = null
  rows[3].contact_id = null
  await mockEventOperations(page, { rows, auth: { uid: 'public-a' } })
  await open(page)
  await expect(page.locator('thead th')).toHaveText(['Name', 'Zip', 'Time'])
  await expect(page.locator('tbody tr').first()).toContainText('AA')
  await expect(page.getByRole('link', { name: 'ALICE ADAMS' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'BOB BROWN' })).toBeVisible()
  await expect(page.locator('tbody')).not.toContainText('example.org')
  await expect(page.locator('tbody')).not.toContainText('75202')
  await expect(page.locator('tbody')).not.toContainText('private-uid')
  await expect(page.getByRole('button', { name: 'Edit contacts' })).toHaveCount(0)
})

for (const claims of [{ role: 'staff' }, { roles: ['member', 'staff'] }]) {
  test(`normalizes staff claim ${JSON.stringify(claims)}`, async ({ page }) => {
    await mockEventOperations(page, { auth: { uid: 'staff-a', claims } })
    await open(page)
    await expect(page.getByRole('button', { name: 'Edit contacts' })).toBeEnabled()
  })
}

test('claim resolution fails closed and stale result cannot elevate another account', async ({ page }) => {
  await mockEventOperations(page, { auth: { uid: 'staff-a', claims: { staff: true }, delay: 500 } })
  await open(page)
  await setAuth(page, { uid: 'public-b' })
  await expect(page.locator('thead th')).toHaveText(['Name', 'Zip', 'Time'])
  await page.waitForTimeout(600)
  await expect(page.getByRole('button', { name: 'Edit contacts' })).toHaveCount(0)
  await expect(page.locator('tbody')).not.toContainText('example.org')
})

test('selection supports indeterminate, clear all, editor/discard and no-op saves', async ({ page }) => {
  const state = await mockEventOperations(page)
  await open(page)
  await page.getByLabel('Select Alice Adams', { exact: true }).check()
  await expect(page.getByLabel('Select all attendees')).toHaveJSProperty('indeterminate', true)
  await page.getByLabel('Select all attendees').check()
  await expect(page.getByText('4 selected', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear selection' }).click()
  await edit(page)
  await expect(page.getByRole('button', { name: 'Remove selected' })).toHaveCount(0)
  await expect(page.getByLabel('Select all attendees')).toHaveCount(0)
  await page.getByLabel('Name for Alice Adams', { exact: true }).fill('Changed Name')
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await expect(page.getByRole('link', { name: 'ALICE ADAMS' })).toBeVisible()
  await edit(page)
  await page.getByLabel('Emails for Alice Adams', { exact: true }).fill(' PERSON0@EXAMPLE.ORG, second0@example.org ')
  await save(page)
  await expect(page.getByRole('button', { name: 'Edit contacts' })).toBeVisible()
  expect(mutations(state)).toHaveLength(0)
  expect(state.groups).toHaveLength(0)
})

test('deduplicates contacts, sends only changed fields and per-checkin timestamps', async ({ page }) => {
  const rows = attendees()
  rows[1].contact_id = rows[0].contact_id
  rows[1].contact = { ...rows[0].contact }
  const state = await mockEventOperations(page, { rows })
  await open(page)
  await edit(page)
  await page.getByLabel('Name for Alice Adams', { exact: true }).first().fill('Alice Updated')
  await page.getByLabel('Time for Alice Adams', { exact: true }).first().fill('2026-11-01T10:45')
  await save(page)
  await expect(page.getByRole('button', { name: 'Edit contacts' })).toBeVisible()
  const calls = mutations(state)
  expect(calls).toHaveLength(2)
  expect(calls[0].body).toEqual({ name: 'Alice Updated' })
  expect(calls[1].body).toEqual({ submitted_on: '2026-11-01T16:45:00Z' })
  expect(state.groups[0].begin.manifest).toHaveLength(2)
  expect(JSON.stringify(calls)).not.toContain('firebase_uid')
  expect(JSON.stringify(calls)).not.toContain('roles')
  await expect(page.getByRole('link', { name: 'ALICE UPDATED' })).toHaveCount(2)
})

for (const count of [1, 2, 3, 4]) {
  test(`removal confirmation grammar and cancellation for ${count} selections`, async ({ page }) => {
    const state = await mockEventOperations(page)
    await open(page)
    for (const name of ['Alice Adams', 'Bob Brown', 'Carol Clark', 'David Davis'].slice(0, count)) await page.getByLabel(`Select ${name}`, { exact: true }).check()
    await page.getByRole('button', { name: 'Remove selected', exact: true }).click()
    const target = ['Alice Adams', 'Alice Adams and Bob Brown', 'Alice Adams, Bob Brown, and Carol Clark', '4 selected contacts'][count - 1]
    await expect(page.getByRole('dialog')).toContainText(`remove ${target} from list of attendees`)
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove selected', exact: true })).toBeFocused()
    expect(mutations(state)).toHaveLength(0)
  })
}

test('failed stage keeps live data and drafts; correction begins a new group', async ({ page }) => {
  const state = await mockEventOperations(page, { failStage: 2 })
  await open(page); await edit(page)
  await page.getByLabel('Name for Alice Adams', { exact: true }).fill('Alice Updated')
  await page.getByLabel('Name for Bob Brown', { exact: true }).fill('Bob Updated')
  await save(page)
  await expect(page.getByRole('alert')).toContainText('Invalid staged input')
  expect(state.rows[0].contact.name).toBe('Alice Adams')
  await expect(page.getByLabel('Name for Alice Adams', { exact: true })).toHaveValue('Alice Updated')
  await page.getByLabel('Name for Bob Brown', { exact: true }).fill('Bob Corrected')
  await save(page)
  await expect(page.getByRole('button', { name: 'Edit contacts' })).toBeVisible()
  expect(state.groups[0].status).toBe('cancelled')
  expect(state.groups).toHaveLength(2)
})

test('atomic removal refreshes count and server Undo restores it without browser history', async ({ page }) => {
  const state = await mockEventOperations(page)
  await open(page)
  await page.getByLabel('Select all attendees').check()
  await page.getByRole('button', { name: 'Remove selected', exact: true }).click()
  await page.getByRole('button', { name: 'Remove attendees', exact: true }).click()
  await expect(page.locator('tbody tr')).toHaveCount(0)
  expect(mutations(state).every(call => call.method === 'DELETE' && call.path.startsWith('/api/checkins/'))).toBe(true)
  await page.keyboard.press('Control+z')
  await expect(page.locator('tbody tr')).toHaveCount(4)
  expect(state.groups[0].status).toBe('undone')
  const stored = await page.evaluate(() => JSON.stringify({ ...window.localStorage }))
  expect(stored).not.toContain('Alice')
  expect(stored).not.toContain('group-')
})

test('navigation warns on dirty drafts; native undo and Shift redo are not application Undo', async ({ page }) => {
  const state = await mockEventOperations(page)
  await open(page); await edit(page)
  await page.getByLabel('Name for Alice Adams', { exact: true }).fill('Changed Alice')
  await page.keyboard.press('Control+z')
  expect(state.calls.filter(c => c.path.endsWith('/undo'))).toHaveLength(0)
  await page.keyboard.press('Control+Shift+z')
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('link', { name: 'Check in for event' }).click()
  await expect(page).toHaveURL(/events\/1/)
})

test('logout clears private rows, selection and drafts immediately, relogin discovers server history', async ({ page }) => {
  const state = await mockEventOperations(page)
  await open(page); await edit(page)
  await page.getByLabel('Name for Alice Adams', { exact: true }).fill('Alice Updated')
  await save(page)
  await expect(page.getByRole('link', { name: 'ALICE UPDATED' })).toBeVisible()
  await edit(page)
  await page.getByLabel('Name for Alice Updated', { exact: true }).fill('Dirty Alice')
  await setAuth(page, {})
  await expect(page.getByLabel('Name for Alice Updated', { exact: true })).toHaveCount(0)
  await expect(page.locator('tbody')).not.toContainText('example.org')
  await setAuth(page, { uid: 'staff-a', claims: { staff: true } })
  await expect(page.getByRole('button', { name: 'Edit contacts' })).toBeVisible()
  await page.keyboard.press('Control+z')
  await expect(page.getByRole('link', { name: 'ALICE ADAMS' })).toBeVisible()
  expect(state.groups[0].status).toBe('undone')
})
