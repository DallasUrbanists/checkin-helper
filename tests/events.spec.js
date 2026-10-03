import { test, expect } from '@playwright/test'
import { hoursFromNow, mockEvents } from './helpers.js'

const rows = page => page.locator('.list-group-item')
const squash = text => text.replace(/\s+/g, ' ')

test.describe('event list', () => {
  test('shows current and future events in start order, omitting past and cancelled events', async ({ page }) => {
    await mockEvents(page)
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Current' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Future' })).toBeVisible()
    await expect(rows(page).locator('.fw-semibold')).toHaveText([
      'Recent Event',
      'Upcoming Soon',
      'Tomorrow Event',
      'Too Far Event'
    ])
    await expect(page.getByText('Too Old Event')).toHaveCount(0)
    await expect(page.getByText('Cancelled Event')).toHaveCount(0)
  })

  test('shows a loading indicator while the calendar is fetched', async ({ page }) => {
    await mockEvents(page, [{ id: '1', title: 'Slow Event', start: hoursFromNow(1) }], { delay: 500 })
    await page.goto('/')

    await expect(page.getByText('Loading events...')).toBeVisible()
    await expect(page.getByText('Slow Event')).toBeVisible()
    await expect(page.getByText('Loading events...')).toBeHidden()
  })

  test('shows an empty message when nothing is in the current window', async ({ page }) => {
    await mockEvents(page, [{ id: '1', title: 'Far Future', start: hoursFromNow(200) }])
    await page.goto('/')

    await expect(page.getByText('No current events ready for check-in at this time.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Future' })).toBeVisible()
    await expect(rows(page).locator('.fw-semibold')).toHaveText(['Far Future'])
  })

  test('displays API event times in the event timezone', async ({ page }) => {
    const start = hoursFromNow(5)
    await mockEvents(page, [{ id: '1', title: 'Zoned Event', start, timezone: 'America/Chicago' }])
    await page.goto('/')

    const expected = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Chicago'
    }).format(start)

    const text = squash(await rows(page).first().innerText())
    expect(text).toContain(squash(expected))
    expect(text).toMatch(/C[SD]T/)
  })

  test('renders API event titles', async ({ page }) => {
    await mockEvents(page, [
      { id: '1', title: 'Bike, Walk & Roll', start: hoursFromNow(1) },
      { id: '2', title: 'Folded Title Event', start: hoursFromNow(2) }
    ])
    await page.goto('/')

    await expect(rows(page).locator('.fw-semibold')).toHaveText(['Bike, Walk & Roll', 'Folded Title Event'])
  })

  test('shows an error with a working retry when the request fails', async ({ page }) => {
    let attempts = 0
    await page.route('**/api/events**', route => {
      attempts++
      if (attempts === 1) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'nope' }) })
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [{ id: '1', title: 'Recovered Event', start_at: hoursFromNow(1).toISOString(), timezone: 'America/Chicago' }], count: 1, total: 1 }) })
    })
    await page.goto('/')

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Events request failed (500)')
    await alert.getByRole('button', { name: 'Retry' }).click()

    await expect(page.getByText('Recovered Event')).toBeVisible()
    await expect(alert).toBeHidden()
  })

  test('shows an error when the network request is blocked', async ({ page }) => {
    await page.route('**/api/events**', route => route.abort('failed'))
    await page.goto('/')

    await expect(page.getByRole('alert').getByRole('button', { name: 'Retry' })).toBeVisible()
  })

  test('uses the in-memory cache across navigation', async ({ page }) => {
    let requests = 0
    await page.route('**/api/events**', route => {
      requests++
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [{ id: '1', title: 'Only Event', start_at: hoursFromNow(1).toISOString(), timezone: 'America/Chicago' }], count: 1, total: 1 }) })
    })
    await page.goto('/')
    await page.getByText('Only Event').click()
    await page.getByRole('button', { name: 'Back' }).click()

    await expect(page.getByText('Only Event')).toBeVisible()
    expect(requests).toBe(1)
  })

  test('shows expired cached data before refreshing it in the background', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('dallas-urbanists-events', JSON.stringify({
        cachedAt: Date.now() - 11 * 60 * 1000,
        events: [{ id: '1', title: 'Cached Event', start_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), timezone: 'America/Chicago' }]
      }))
    })
    await mockEvents(page, [{ id: '1', title: 'Updated Event', start: hoursFromNow(1) }], { delay: 500 })
    await page.goto('/')

    await expect(page.getByText('Cached Event')).toBeVisible()
    await expect(page.getByText('Loading events...')).toBeHidden()
    await expect(page.getByText('Updated Event')).toBeVisible()
    await expect(page.getByText('Cached Event')).toHaveCount(0)
  })

})
