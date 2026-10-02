import { test, expect } from '@playwright/test'
import { mockApi, mockCalendar } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await mockCalendar(page)
  await mockApi(page)
})

test('clicking an event opens its check-in page with the event id in the URL', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Upcoming Soon').click()

  await expect(page).toHaveURL(/#\/checkin\/1003$/)
  await expect(page.locator('nav.navbar')).toContainText('Upcoming Soon')
  await expect(page.getByRole('heading', { name: 'Check in' })).toBeVisible()
})

test('each event passes along its own id', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Tomorrow Event').click()

  await expect(page).toHaveURL(/#\/checkin\/1004$/)
})

test('the check-in page loads directly from a URL', async ({ page }) => {
  await page.goto('/#/checkin/1003')

  await expect(page.locator('nav.navbar')).toContainText('Upcoming Soon')
  await expect(page.getByRole('heading', { name: 'Check in' })).toBeVisible()
  await expect(page.getByText(/\d{1,2}:\d{2}/)).toBeVisible()
})

test('an unknown event id shows a not-found message', async ({ page }) => {
  await page.goto('/#/checkin/does-not-exist')

  await expect(page.getByRole('alert')).toContainText('That event could not be found.')
  await expect(page.locator('#name')).toHaveCount(0)
  await page.getByRole('alert').getByRole('link', { name: 'Pick an event' }).click()
  await expect(page.locator('nav.navbar')).toContainText('Choose event')
})

test('the back button returns to the prior view', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Upcoming Soon').click()
  await expect(page).toHaveURL(/#\/checkin\/1003$/)

  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.locator('nav.navbar')).toContainText('Choose event')
})

test('unknown routes redirect to the event list', async ({ page }) => {
  await page.goto('/#/nonsense/path')

  await expect(page.locator('nav.navbar')).toContainText('Choose event')
})

test('matches and confirmation pages redirect home when opened without a check-in', async ({ page }) => {
  await page.goto('/#/checkin/1003/matches')
  await expect(page.locator('nav.navbar')).toContainText('Choose event')

  await page.goto('/#/confirmation')
  await expect(page.locator('nav.navbar')).toContainText('Choose event')
})

test('navbar renders appropriate logo, back button, and titles across views', async ({ page }) => {
  await mockApi(page, {
    contacts: [
      { id: 1, name: 'Jane Doe', emails: ['jane1@example.com'] },
      { id: 2, name: 'Jane Smith', emails: ['jane2@example.com'] }
    ]
  })

  // 1. HomeView: SVG logo + "Choose event"
  await page.goto('/')
  const nav = page.locator('nav.navbar')
  await expect(nav.locator('svg#Layer_1')).toBeVisible()
  await expect(nav).toContainText('Choose event')
  await expect(nav.getByRole('button', { name: 'Back' })).toHaveCount(0)

  // 2. CheckinView: Back button + event title (no SVG logo)
  await page.getByText('Upcoming Soon').click()
  await expect(nav.getByRole('button', { name: 'Back' })).toBeVisible()
  await expect(nav.locator('svg#Layer_1')).toHaveCount(0)
  await expect(nav).toContainText('Upcoming Soon')

  // 3. MatchesView: Back button + event title
  await page.locator('#name').fill('Jane')
  await page.getByRole('button', { name: 'Check in' }).click()
  await expect(page).toHaveURL(/#\/checkin\/1003\/matches$/)
  await expect(nav.getByRole('button', { name: 'Back' })).toBeVisible()
  await expect(nav.locator('svg#Layer_1')).toHaveCount(0)
  await expect(nav).toContainText('Upcoming Soon')

  // Back button from MatchesView navigates to prior view (CheckinView)
  await nav.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/#\/checkin\/1003$/)

  // 4. ConfirmationView: Back button + event title
  await page.locator('#name').fill('Jane')
  await page.getByRole('button', { name: 'Check in' }).click()
  await expect(page).toHaveURL(/#\/checkin\/1003\/matches$/)
  await page.getByRole('button', { name: 'None of those are me' }).click()
  await expect(page).toHaveURL(/#\/confirmation$/)
  await expect(nav.getByRole('button', { name: 'Back' })).toBeVisible()
  await expect(nav.locator('svg#Layer_1')).toHaveCount(0)
  await expect(nav).toContainText('Upcoming Soon')
})
