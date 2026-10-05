import { test, expect } from '@playwright/test'
import { attendees, mockEventOperations, setAuth } from './event-operations-mock.js'

async function update(page, from, to) {
  await page.getByRole('button', { name: 'Edit attendees', exact: true }).click()
  await page.getByLabel(`Name for ${from}`, { exact: true }).fill(to)
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
}
async function open(page, options) {
  const state = await mockEventOperations(page, options)
  await page.goto('/#/events/1')
  await expect(page.getByRole('button', { name: 'Edit attendees', exact: true })).toBeVisible()
  return state
}

test('server history supports sequential source-wide Undo, across navigation and reload', async ({ page }) => {
  const state = await open(page)
  await update(page, 'Alice Adams', 'Alice Updated')
  await expect(page.getByRole('link', { name: 'ALICE UPDATED' })).toBeVisible()
  await update(page, 'Bob Brown', 'Bob Updated')
  await expect(page.getByRole('link', { name: 'BOB UPDATED' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: 'BOB UPDATED' })).toBeVisible()
  await page.keyboard.press('Meta+z')
  await expect(page.getByRole('link', { name: 'BOB BROWN' })).toBeVisible()
  await page.keyboard.press('Control+z')
  await expect(page.getByRole('link', { name: 'ALICE ADAMS' })).toBeVisible()
  expect(state.groups.map(g => g.status)).toEqual(['undone', 'undone'])
  const calls = state.calls.filter(c => c.path.endsWith('/undo'))
  expect(calls.map(c => c.body)).toEqual([
    { expected_latest_group_id: 'group-2', expected_latest_commit_order: '2', source: 'event-view' },
    { expected_latest_group_id: 'group-1', expected_latest_commit_order: '1', source: 'event-view' }
  ])
})

for (const kind of ['commit', 'undo']) {
  test(`lost ${kind} response recovers from metadata without duplicate transactions`, async ({ page }) => {
    const state = await open(page, { lostCommit: kind === 'commit', lostUndo: kind === 'undo' })
    await update(page, 'Alice Adams', 'Alice Updated')
    if (kind === 'undo') {
      await expect(page.getByRole('link', { name: 'ALICE UPDATED' })).toBeVisible()
      await page.keyboard.press('Control+z')
    }
    await expect(page.getByRole('button', { name: 'Retry recovery' })).toBeVisible()
    await page.getByRole('button', { name: 'Retry recovery' }).click()
    await expect(page.getByRole('button', { name: 'Retry recovery' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: kind === 'commit' ? 'ALICE UPDATED' : 'ALICE ADAMS' })).toBeVisible()
    expect(state.groups).toHaveLength(1)
    expect(state.calls.filter(c => c.path.endsWith(`/${kind}`))).toHaveLength(1)
  })
}

test('blocked latest action is not skipped to an older action', async ({ page }) => {
  const state = await open(page)
  await update(page, 'Alice Adams', 'Alice Updated')
  await expect(page.getByRole('link', { name: 'ALICE UPDATED' })).toBeVisible()
  await update(page, 'Bob Brown', 'Bob Updated')
  await expect(page.getByRole('link', { name: 'BOB UPDATED' })).toBeVisible()
  state.blocked = true
  await page.reload()
  await expect(page.getByRole('link', { name: 'BOB UPDATED' })).toBeVisible()
  await page.keyboard.press('Control+z')
  await expect(page.getByText('Records or history changed. Refresh and review before trying again.')).toBeVisible()
  expect(state.groups.every(g => g.status === 'committed')).toBe(true)
  expect(state.calls.filter(c => c.path.endsWith('/undo')).map(c => c.path)).toEqual(['/api/operation-groups/group-2/undo'])
})

test('expiry and cross-tab stale latest conflicts preserve live data and refresh history', async ({ page }) => {
  const state = await open(page)
  await update(page, 'Alice Adams', 'Alice Updated')
  await expect(page.getByRole('link', { name: 'ALICE UPDATED' })).toBeVisible()
  state.expired = true
  await page.keyboard.press('Control+z')
  await expect(page.getByText('This action has expired and can no longer be undone.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit attendees', exact: true })).toBeEnabled()
  state.expired = false
  state.groups.push({ ...state.groups[0], group_id: 'remote-group', receipt: { ...state.groups[0].receipt, group_id: 'remote-group', commit_order: '2' } })
  await page.keyboard.press('Control+z')
  await expect(page.getByText('Records or history changed. Refresh and review before trying again.')).toBeVisible()
  expect(state.rows[0].contact.name).toBe('Alice Updated')
  expect(state.groups[0].status).toBe('committed')
})

test('another account has no Undo candidate, dirty drafts block application Undo', async ({ page }) => {
  const state = await open(page)
  await update(page, 'Alice Adams', 'Alice Updated')
  await expect(page.getByRole('link', { name: 'ALICE UPDATED' })).toBeVisible()
  await page.getByRole('button', { name: 'Edit attendees', exact: true }).click()
  await page.getByLabel('Name for Alice Updated', { exact: true }).fill('Draft Alice')
  await page.getByRole('heading', { name: 'Community Walk', exact: true }).click()
  await page.keyboard.press('Control+z')
  await expect(page.getByText('Save or discard table changes before Undo.')).toBeVisible()
  expect(state.calls.filter(c => c.path.endsWith('/undo'))).toHaveLength(0)
  await setAuth(page, { uid: 'staff-b', claims: { staff: true } })
  await expect(page.getByRole('button', { name: 'Edit attendees', exact: true })).toBeVisible()
  await page.keyboard.press('Control+z')
  expect(state.calls.filter(c => c.path.endsWith('/undo'))).toHaveLength(0)
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0)
})

test('commit failure preserves all attendees and selection; no immediate deletion fallback', async ({ page }) => {
  const state = await open(page, { failCommit: true })
  await page.getByLabel('Select all attendees').check()
  await page.getByRole('button', { name: 'Remove selected', exact: true }).click()
  await page.getByRole('button', { name: 'Remove attendees', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Atomic commit conflict')
  await expect(page.locator('tbody tr')).toHaveCount(4)
  await expect(page.getByLabel('Select all attendees')).toBeChecked()
  expect(state.rows).toHaveLength(4)
  expect(state.groups[0].status).toBe('cancelled')
  expect(state.calls.filter(c => c.method === 'DELETE' && c.path.includes('/checkins/')).every(c => c.headers['x-operation-group'])).toBe(true)
})

test('missing revision rejects before begin; historical time does not block contact Save', async ({ page }) => {
  const rows = attendees()
  rows[0].contact.revision = undefined
  rows[0].submitted_on = '2000-01-01T00:00:00.123456Z'
  const state = await open(page, { rows })
  await update(page, 'Alice Adams', 'Alice Updated')
  await expect(page.getByRole('alert')).toContainText('Revision is required')
  expect(state.groups).toHaveLength(0)
  await expect(page.getByLabel('Name for Alice Adams', { exact: true })).toHaveValue('Alice Updated')
})

test('desktop/mobile layout keeps toolbar outside scrolling table and notifications out of toolbar', async ({ page, isMobile }) => {
  await open(page)
  await update(page, 'Alice Adams', 'Alice Updated')
  await expect(page.getByRole('link', { name: 'ALICE UPDATED' })).toBeVisible()
  await page.getByRole('button', { name: 'Edit attendees', exact: true }).click()
  const result = await page.evaluate(() => {
    const table = document.querySelector('.attendance-scroll')
    const toolbar = document.querySelector('.attendance-toolbar')
    const host = document.querySelector('.operation-notifications')
    const bar = toolbar.getBoundingClientRect()
    const notice = host.getBoundingClientRect()
    return { outside: !table.contains(toolbar), sticky: window.getComputedStyle(toolbar).position, horizontal: table.scrollWidth > table.clientWidth, wrapped: bar.height > 0, overlap: bar.top < notice.bottom && bar.bottom > notice.top, bodyWidth: document.documentElement.scrollWidth, viewport: window.innerWidth }
  })
  expect(result.outside).toBe(true)
  expect(result.sticky).toBe('sticky')
  if (isMobile) expect(result.horizontal).toBe(true)
  expect(result.overlap).toBe(false)
  expect(result.bodyWidth).toBeLessThanOrEqual(result.viewport)
})
