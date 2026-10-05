import { test, expect } from '@playwright/test'
import { fillCheckin, mockApi, mockCalendar, submitCheckin } from './helpers.js'

const EVENT_ID = '1003'

test.beforeEach(async ({ page }) => {
  await mockCalendar(page)
})

async function openCheckin(page) {
  await page.goto(`/#/checkin/${EVENT_ID}`)
  await expect(page.locator('#name')).toBeVisible()
}

const jane = (overrides = {}) => ({
  id: 7,
  name: 'Jane Doe',
  emails: ['jane.doe@gmail.com'],
  phones: ['+1-214-555-0199'],
  zip_home: '75201',
  zip_other: [],
  roles: ['member'],
  ...overrides
})

test.describe('no existing contact', () => {
  test('creates a contact, checks them in, and shows the confirmation page', async ({ page }) => {
    const calls = await mockApi(page)
    await openCheckin(page)
    await fillCheckin(page, { name: '  Alex   Rivera ', email: 'alex@example.com', phone: '2145550123', zip: '75204' })
    await submitCheckin(page)

    await expect(page).toHaveURL(/#\/confirmation$/)
    expect(calls.search).toEqual(['Alex Rivera'])
    expect(calls.create).toEqual([{
      name: 'Alex Rivera',
      emails: ['alex@example.com'],
      phones: ['+1-214-555-0123'],
      zip_home: '75204'
    }])
    expect(calls.update).toHaveLength(0)
    expect(calls.checkin).toEqual([{ contact_id: 100, event_id: EVENT_ID }])
  })

  test('omits optional fields that were left blank', async ({ page }) => {
    const calls = await mockApi(page)
    await openCheckin(page)
    await fillCheckin(page, { name: 'Sam Lee' })
    await submitCheckin(page)

    await expect(page).toHaveURL(/#\/confirmation$/)
    expect(calls.create).toEqual([{ name: 'Sam Lee' }])
  })

  test('uses the event id from the URL for the check-in', async ({ page }) => {
    const calls = await mockApi(page)
    await page.goto('/#/checkin/1004')
    await fillCheckin(page, { name: 'Sam Lee' })
    await submitCheckin(page)

    await expect(page).toHaveURL(/#\/confirmation$/)
    expect(calls.checkin[0].event_id).toBe('1004')
  })
})

test.describe('loading interstitial', () => {
  test('covers the page while the check-in is processed', async ({ page }) => {
    await mockApi(page, { delay: 400 })
    await openCheckin(page)
    await fillCheckin(page, { name: 'Sam Lee' })
    await submitCheckin(page)

    await expect(page.getByRole('status').filter({ hasText: 'Checking in...' })).toBeVisible()
    await expect(page).toHaveURL(/#\/confirmation$/)
    await expect(page.getByText('Checking in...')).toBeHidden()
  })

  test('only sends one check-in when the button is clicked repeatedly', async ({ page }) => {
    const calls = await mockApi(page, { delay: 300 })
    await openCheckin(page)
    await fillCheckin(page, { name: 'Sam Lee' })
    const button = page.getByRole('button', { name: 'Check in', exact: true })
    await button.click()
    await button.click({ force: true, timeout: 500 }).catch(() => {})

    await expect(page).toHaveURL(/#\/confirmation$/)
    expect(calls.checkin).toHaveLength(1)
  })
})

test.describe('exactly one existing contact', () => {
  test('checks in the contact without updating when nothing is new', async ({ page }) => {
    const calls = await mockApi(page, {
      contacts: [jane({ emails: ['Jane.Doe@Gmail.com'], phones: ['(214) 555-0199'] })]
    })
    await openCheckin(page)
    await fillCheckin(page, { name: 'Jane Doe', email: 'jane.doe@gmail.com', phone: '2145550199', zip: '75201' })
    await submitCheckin(page)

    await expect(page).toHaveURL(/#\/confirmation$/)
    expect(calls.create).toHaveLength(0)
    expect(calls.update).toHaveLength(0)
    expect(calls.checkin).toEqual([{ contact_id: 7, event_id: EVENT_ID }])
  })

  test('appends a new email and phone to the existing arrays', async ({ page }) => {
    const calls = await mockApi(page, { contacts: [jane()] })
    await openCheckin(page)
    await fillCheckin(page, { name: 'Jane Doe', email: 'jane@work.org', phone: '9725550000' })
    await submitCheckin(page)

    await expect(page).toHaveURL(/#\/confirmation$/)
    expect(calls.update).toEqual([{
      id: 7,
      body: {
        name: 'Jane Doe',
        emails: ['jane.doe@gmail.com', 'jane@work.org'],
        phones: ['+1-214-555-0199', '+1-972-555-0000'],
        zip_home: '75201',
        zip_other: [],
        roles: ['member']
      }
    }])
    expect(calls.checkin).toEqual([{ contact_id: 7, event_id: EVENT_ID }])
  })

  test('sets zip_home when the contact has none', async ({ page }) => {
    const calls = await mockApi(page, { contacts: [jane({ zip_home: null })] })
    await openCheckin(page)
    await fillCheckin(page, { name: 'Jane Doe', zip: '75204' })
    await submitCheckin(page)

    await expect(page).toHaveURL(/#\/confirmation$/)
    expect(calls.update[0].body.zip_home).toBe('75204')
    expect(calls.update[0].body.zip_other).toEqual([])
  })

  test('appends a different zip to zip_other when zip_home is already set', async ({ page }) => {
    const calls = await mockApi(page, { contacts: [jane({ zip_other: ['75202'] })] })
    await openCheckin(page)
    await fillCheckin(page, { name: 'Jane Doe', zip: '75204' })
    await submitCheckin(page)

    await expect(page).toHaveURL(/#\/confirmation$/)
    expect(calls.update[0].body.zip_home).toBe('75201')
    expect(calls.update[0].body.zip_other).toEqual(['75202', '75204'])
  })

  for (const zip of ['75201', '75202']) {
    test(`does not update when zip ${zip} is already on file`, async ({ page }) => {
      const calls = await mockApi(page, { contacts: [jane({ zip_other: ['75202'] })] })
      await openCheckin(page)
      await fillCheckin(page, { name: 'Jane Doe', zip })
      await submitCheckin(page)

      await expect(page).toHaveURL(/#\/confirmation$/)
      expect(calls.update).toHaveLength(0)
    })
  }

  test('does not blank out stored data when optional fields are left empty', async ({ page }) => {
    const calls = await mockApi(page, { contacts: [jane()] })
    await openCheckin(page)
    await fillCheckin(page, { name: 'Jane Doe' })
    await submitCheckin(page)

    await expect(page).toHaveURL(/#\/confirmation$/)
    expect(calls.update).toHaveLength(0)
  })

  test('treats a partial-name match as the single contact', async ({ page }) => {
    const calls = await mockApi(page, { contacts: [jane()] })
    await openCheckin(page)
    await fillCheckin(page, { name: 'Jane' })
    await submitCheckin(page)

    await expect(page).toHaveURL(/#\/confirmation$/)
    expect(calls.checkin).toEqual([{ contact_id: 7, event_id: EVENT_ID }])
  })
})

test.describe('multiple matching contacts', () => {
  const contacts = [
    jane(),
    jane({
      id: 8,
      name: 'Jane Smith',
      emails: ['janesmith@yahoo.com'],
      phones: ['+1-972-555-0000'],
      zip_home: '75001',
      zip_other: ['75002']
    }),
    jane({ id: 9, name: 'Janet Park', emails: [], phones: [], zip_home: null })
  ]

  async function reachMatches(page, form = { name: 'Jane' }, options = {}) {
    const calls = await mockApi(page, { contacts, ...options })
    await openCheckin(page)
    await fillCheckin(page, form)
    await submitCheckin(page)
    await expect(page).toHaveURL(/#\/checkin\/1003\/matches$/)
    return calls
  }

  const option = (page, name) => page.getByRole('button', { name: new RegExp(name) })

  test('lists each match under the heading "Are one of these you?"', async ({ page }) => {
    const calls = await reachMatches(page)

    await expect(page.getByRole('heading', { name: 'Are one of these you?' })).toBeVisible()
    await expect(option(page, 'Jane Doe')).toBeVisible()
    await expect(option(page, 'Jane Smith')).toBeVisible()
    await expect(option(page, 'Janet Park')).toBeVisible()
    await expect(page.getByRole('button', { name: 'None of those are me' })).toBeVisible()
    expect(calls.checkin).toHaveLength(0)
    expect(calls.create).toHaveLength(0)
  })

  test('censors email, censors phone, and hides zip when nothing matches exactly', async ({ page }) => {
    await reachMatches(page)

    const doe = option(page, 'Jane Doe')
    await expect(doe).toContainText('j******e@g****.com')
    await expect(doe).toContainText('21*-***-**99')
    await expect(doe).not.toContainText('jane.doe')
    await expect(doe).not.toContainText('555')
    await expect(doe).not.toContainText('75201')

    const smith = option(page, 'Jane Smith')
    await expect(smith).toContainText('j*******h@y****.com')
    await expect(smith).toContainText('97*-***-**00')
    await expect(smith).not.toContainText('75001')
    await expect(smith).not.toContainText('75002')
  })

  test('shows email, phone, and zip in full when they exactly match the submission', async ({ page }) => {
    await reachMatches(page, { name: 'Jane', email: 'jane.doe@gmail.com', phone: '2145550199', zip: '75201' })

    const doe = option(page, 'Jane Doe')
    await expect(doe).toContainText('jane.doe@gmail.com')
    await expect(doe).toContainText('214-555-0199')
    await expect(doe).toContainText('75201')

    const smith = option(page, 'Jane Smith')
    await expect(smith).not.toContainText('janesmith@yahoo.com')
    await expect(smith).not.toContainText('75001')
  })

  test('reveals each field independently', async ({ page }) => {
    await reachMatches(page, { name: 'Jane', email: 'jane.doe@gmail.com' })

    const doe = option(page, 'Jane Doe')
    await expect(doe).toContainText('jane.doe@gmail.com')
    await expect(doe).toContainText('21*-***-**99')
    await expect(doe).not.toContainText('75201')
  })

  test('shows a match for a zip held in zip_other', async ({ page }) => {
    await reachMatches(page, { name: 'Jane', zip: '75002' })

    await expect(option(page, 'Jane Smith')).toContainText('75002')
    await expect(option(page, 'Jane Doe')).not.toContainText('7500')
  })

  test('choosing a match updates the contact, checks in, and confirms', async ({ page }) => {
    const calls = await reachMatches(page, { name: 'Jane', email: 'new@example.com', phone: '2145550123', zip: '75099' })
    await option(page, 'Jane Smith').click()

    await expect(page).toHaveURL(/#\/confirmation$/)
    expect(calls.update).toEqual([{
      id: 8,
      body: {
        name: 'Jane Smith',
        emails: ['janesmith@yahoo.com', 'new@example.com'],
        phones: ['+1-972-555-0000', '+1-214-555-0123'],
        zip_home: '75001',
        zip_other: ['75002', '75099'],
        roles: ['member']
      }
    }])
    expect(calls.checkin).toEqual([{ contact_id: 8, event_id: EVENT_ID }])
    expect(calls.create).toHaveLength(0)
    await expect(page.getByText('Jane Smith')).toBeVisible()
  })

  test('choosing a match with nothing new skips the update', async ({ page }) => {
    const calls = await reachMatches(page, { name: 'Jane', email: 'jane.doe@gmail.com' })
    await option(page, 'Jane Doe').click()

    await expect(page).toHaveURL(/#\/confirmation$/)
    expect(calls.update).toHaveLength(0)
    expect(calls.checkin).toEqual([{ contact_id: 7, event_id: EVENT_ID }])
  })

  test('shows the loading interstitial while a choice is processed', async ({ page }) => {
    await mockApi(page, { contacts, delay: 400 })
    await openCheckin(page)
    await fillCheckin(page, { name: 'Jane' })
    await submitCheckin(page)
    await expect(page).toHaveURL(/#\/checkin\/1003\/matches$/)
    await option(page, 'Jane Doe').click()

    await expect(page.getByRole('status').filter({ hasText: 'Checking in...' })).toBeVisible()
    await expect(page).toHaveURL(/#\/confirmation$/)
  })

  test('"None of those are me" creates a new contact from the submitted form', async ({ page }) => {
    const calls = await reachMatches(page, { name: 'Jane', email: 'jane@new.org', phone: '2145550123', zip: '75204' })
    await page.getByRole('button', { name: 'None of those are me' }).click()

    await expect(page).toHaveURL(/#\/confirmation$/)
    expect(calls.create).toEqual([{
      name: 'Jane',
      emails: ['jane@new.org'],
      phones: ['+1-214-555-0123'],
      zip_home: '75204'
    }])
    expect(calls.update).toHaveLength(0)
    expect(calls.checkin).toEqual([{ contact_id: 100, event_id: EVENT_ID }])
  })
})

test.describe('confirmation page', () => {
  test('shows event details and the details that were submitted', async ({ page }) => {
    await mockApi(page)
    await openCheckin(page)
    await fillCheckin(page, { name: 'Alex Rivera', email: 'alex@example.com', phone: '2145550123', zip: '75204' })
    await submitCheckin(page)

    await expect(page.getByRole('heading', { name: "You're checked in!" })).toBeVisible()
    const main = page.locator('main')
    await expect(main).toContainText('Upcoming Soon')
    await expect(main).toContainText('City Hall, 1500 Marilla St')
    await expect(main).toContainText(/\d{1,2}:\d{2}/)
    await expect(main).toContainText('Alex Rivera')
    await expect(main).toContainText('alex@example.com')
    await expect(main).toContainText('214-555-0123')
    await expect(main).toContainText('75204')
  })

  test('omits contact fields that were not provided', async ({ page }) => {
    await mockApi(page)
    await openCheckin(page)
    await fillCheckin(page, { name: 'Sam Lee' })
    await submitCheckin(page)

    const contact = page.locator('section', { has: page.getByRole('heading', { name: 'Contact' }) })
    await expect(contact).toContainText('Sam Lee')
    await expect(contact).not.toContainText('@')
    await expect(contact).not.toContainText('(')
  })

  test('never reveals stored details of a matched contact that were not submitted', async ({ page }) => {
    await mockApi(page, { contacts: [jane()] })
    await openCheckin(page)
    await fillCheckin(page, { name: 'Jane Doe' })
    await submitCheckin(page)

    await expect(page.getByRole('heading', { name: "You're checked in!" })).toBeVisible()
    await expect(page.locator('main')).not.toContainText('jane.doe@gmail.com')
    await expect(page.locator('main')).not.toContainText('555-0199')
  })

  test('"Check in another person" returns to an empty form for the same event', async ({ page }) => {
    await mockApi(page)
    await openCheckin(page)
    await fillCheckin(page, { name: 'Alex Rivera', email: 'alex@example.com' })
    await submitCheckin(page)
    await page.getByRole('button', { name: 'Check in another person' }).click()

    await expect(page).toHaveURL(/#\/checkin\/1003$/)
    await expect(page.getByRole('heading', { name: 'Check in' })).toBeVisible()
    await expect(page.locator('#name')).toHaveValue('')
    await expect(page.locator('#email')).toHaveValue('')
  })

  test('a second person can be checked in after the first', async ({ page }) => {
    const calls = await mockApi(page)
    await openCheckin(page)
    await fillCheckin(page, { name: 'Alex Rivera' })
    await submitCheckin(page)
    await page.getByRole('button', { name: 'Check in another person' }).click()
    await fillCheckin(page, { name: 'Sam Lee' })
    await submitCheckin(page)

    await expect(page.locator('main')).toContainText('Sam Lee')
    expect(calls.search).toEqual(['Alex Rivera', 'Sam Lee'])
    expect(calls.checkin.map(c => c.contact_id)).toEqual([100, 101])
  })
})

test.describe('API failures', () => {
  test('shows the server message and stays on the form when the search fails', async ({ page }) => {
    await mockApi(page, { fail: { search: { status: 500, message: 'Database unavailable' } } })
    await openCheckin(page)
    await fillCheckin(page, { name: 'Sam Lee', email: 'sam@example.com' })
    await submitCheckin(page)

    await expect(page.getByRole('alert')).toContainText('Database unavailable')
    await expect(page).toHaveURL(/#\/checkin\/1003$/)
    await expect(page.locator('#email')).toHaveValue('sam@example.com')
    await expect(page.getByText('Checking in...')).toBeHidden()
  })

  test('shows a connection message when the server is unreachable', async ({ page }) => {
    await mockApi(page, { fail: { search: 'abort' } })
    await openCheckin(page)
    await fillCheckin(page, { name: 'Sam Lee' })
    await submitCheckin(page)

    await expect(page.getByRole('alert')).toContainText('Could not reach the server')
  })

  test('does not show the confirmation page when the check-in itself fails', async ({ page }) => {
    await mockApi(page, { fail: { checkin: { status: 400, message: 'event_id is invalid' } } })
    await openCheckin(page)
    await fillCheckin(page, { name: 'Sam Lee' })
    await submitCheckin(page)

    await expect(page.getByRole('alert')).toContainText('event_id is invalid')
    await expect(page).toHaveURL(/#\/checkin\/1003$/)
  })

  test('the form can be resubmitted after a failure', async ({ page }) => {
    let first = true
    await mockApi(page)
    await page.route('http://127.0.0.1:4199/api/contacts?*', route => {
      if (first) {
        first = false
        return route.fulfill({
          status: 500,
          headers: { 'access-control-allow-origin': '*' },
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Temporary glitch' })
        })
      }
      return route.fallback()
    })
    await openCheckin(page)
    await fillCheckin(page, { name: 'Sam Lee' })
    await submitCheckin(page)
    await expect(page.getByRole('alert')).toContainText('Temporary glitch')

    await submitCheckin(page)
    await expect(page).toHaveURL(/#\/confirmation$/)
  })

  test('shows an error on the matches page when a choice fails', async ({ page }) => {
    await mockApi(page, {
      contacts: [jane(), jane({ id: 8, name: 'Jane Smith' })],
      fail: { checkin: { status: 500, message: 'Check-in failed' } }
    })
    await openCheckin(page)
    await fillCheckin(page, { name: 'Jane' })
    await submitCheckin(page)
    await page.getByRole('button', { name: /Jane Doe/ }).click()

    await expect(page.getByRole('alert')).toContainText('Check-in failed')
    await expect(page).toHaveURL(/#\/checkin\/1003\/matches$/)
    await expect(page.getByRole('button', { name: 'None of those are me' })).toBeEnabled()
  })
})
