import { test, expect } from '@playwright/test'
import { mockApi, mockCalendar, submitCheckin } from './helpers.js'

const DOMAINS = ['@gmail.com', '@yahoo.com', '@outlook.com', '@icloud.com', '@hotmail.com', '@proton.me']

test.beforeEach(async ({ page }) => {
  await mockCalendar(page)
  await mockApi(page)
  await page.goto('/#/checkin/1003')
  await expect(page.locator('#name')).toBeVisible()
})

const invalidFeedback = (page, id) => page.locator(`#${id}-feedback`)
const domainButtons = page => page.locator('form .btn-outline-secondary')

test('uses floating labels for all contact fields', async ({ page }) => {
  for (const [id, placeholder, value] of [
    ['name', 'Name', 'Jane Doe'],
    ['email', 'Email', 'jane@example.com'],
    ['phone', 'Phone', '2145551234'],
    ['zip', 'Zip code', '75201']
  ]) {
    const input = page.locator(`#${id}`)
    const label = page.locator(`.form-floating > #${id} + label`)
    await expect(input).toHaveAttribute('placeholder', placeholder)
    await expect(label).toHaveAttribute('for', id)
    await expect(label).toBeVisible()
    const restingTransform = await label.evaluate(element => window.getComputedStyle(element).transform)

    await input.fill(value)
    await input.blur()
    await expect.poll(() => label.evaluate(element => window.getComputedStyle(element).transform))
      .not.toBe(restingTransform)
  }
})

test.describe('name', () => {
  test('is required and flagged on blur, not while typing', async ({ page }) => {
    const name = page.locator('#name')
    await name.focus()
    await expect(invalidFeedback(page, 'name')).toBeHidden()

    await name.blur()
    await expect(name).toHaveClass(/is-invalid/)
    await expect(invalidFeedback(page, 'name')).toHaveText('Name is required.')
  })

  test('requires at least 2 characters', async ({ page }) => {
    const name = page.locator('#name')
    await name.fill('A')
    await name.blur()
    await expect(invalidFeedback(page, 'name')).toHaveText('Name must be at least 2 characters.')

    await name.fill('Al')
    await name.blur()
    await expect(name).not.toHaveClass(/is-invalid/)
  })

  test('allows 64 characters but not 65', async ({ page }) => {
    const name = page.locator('#name')
    await name.fill(['a'.repeat(30), 'b'.repeat(33)].join(' ')) // 64 chars, 2 words
    await name.blur()
    await expect(name).not.toHaveClass(/is-invalid/)

    await name.fill(['a'.repeat(30), 'b'.repeat(34)].join(' ')) // 65 chars
    await name.blur()
    await expect(invalidFeedback(page, 'name')).toHaveText('Name must be 64 characters or fewer.')
  })

  test('allows 6 words but not 7', async ({ page }) => {
    const name = page.locator('#name')
    await name.fill('one two three four five six')
    await name.blur()
    await expect(name).not.toHaveClass(/is-invalid/)

    await name.fill('one two three four five six seven')
    await name.blur()
    await expect(invalidFeedback(page, 'name')).toHaveText('Name must be 6 words or fewer.')
  })

  test('ignores extra whitespace when counting words and length', async ({ page }) => {
    const name = page.locator('#name')
    await name.fill('   one   two   three   four   five   six   ')
    await name.blur()
    await expect(name).not.toHaveClass(/is-invalid/)

    await name.fill('     ')
    await name.blur()
    await expect(invalidFeedback(page, 'name')).toHaveText('Name is required.')
  })

  test('error clears once the user starts typing again', async ({ page }) => {
    const name = page.locator('#name')
    await name.focus()
    await name.blur()
    await expect(name).toHaveClass(/is-invalid/)

    await name.focus()
    await page.keyboard.type('J')
    await expect(name).not.toHaveClass(/is-invalid/)
  })
})

test.describe('email', () => {
  test('discards characters that cannot appear in an email address as the user types', async ({ page }) => {
    const email = page.locator('#email')
    await email.focus()
    await page.keyboard.type('ja ne,(d)<o>e"[x]\\:;@exam ple!.com')

    await expect(email).toHaveValue('janedoex@example.com')
  })

  test('lowercases input and allows only one @ symbol', async ({ page }) => {
    const email = page.locator('#email')
    await email.focus()
    await page.keyboard.type('Jane.Doe+tag@Ex@mple.COM')

    await expect(email).toHaveValue('jane.doe+tag@exmple.com')
  })

  test('does not allow special characters in the domain', async ({ page }) => {
    const email = page.locator('#email')
    await email.focus()
    await page.keyboard.type('a@b_c+d!.com')

    await expect(email).toHaveValue('a@bcd.com')
  })

  test('is optional', async ({ page }) => {
    const email = page.locator('#email')
    await email.focus()
    await email.blur()

    await expect(email).not.toHaveClass(/is-invalid/)
  })

  for (const value of ['jane', 'jane@', 'jane@example', 'jane@example.c', '@example.com', '.jane@example.com', 'jane.@example.com', 'ja..ne@example.com']) {
    test(`flags "${value}" as invalid on blur`, async ({ page }) => {
      const email = page.locator('#email')
      await email.fill(value)
      await email.blur()

      await expect(email).toHaveClass(/is-invalid/)
      await expect(invalidFeedback(page, 'email')).toHaveText('Enter a valid email address.')
    })
  }

  for (const value of ['jane@example.com', 'jane.doe+news@mail.example.co.uk', "o'brien@example.org"]) {
    test(`accepts "${value}"`, async ({ page }) => {
      const email = page.locator('#email')
      await email.fill(value)
      await email.blur()

      await expect(email).not.toHaveClass(/is-invalid/)
    })
  }

  test('feedback waits for blur and disappears while typing', async ({ page }) => {
    const email = page.locator('#email')
    await email.focus()
    await page.keyboard.type('jane@')
    await expect(email).not.toHaveClass(/is-invalid/)

    await email.blur()
    await expect(email).toHaveClass(/is-invalid/)

    await email.focus()
    await page.keyboard.type('x')
    await expect(email).not.toHaveClass(/is-invalid/)
  })
})

test.describe('email domain shortcuts', () => {
  test('render every domain as a small outline button', async ({ page }) => {
    await expect(domainButtons(page)).toHaveText(DOMAINS)
    for (const button of await domainButtons(page).all()) {
      await expect(button).toHaveClass(/btn-sm/)
      await expect(button).toBeEnabled()
    }
  })

  test('append the domain to the end of what was typed', async ({ page }) => {
    await page.locator('#email').fill('jane.doe')
    await page.getByRole('button', { name: '@gmail.com' }).click()

    await expect(page.locator('#email')).toHaveValue('jane.doe@gmail.com')
  })

  for (const domain of DOMAINS) {
    test(`${domain} produces a valid address`, async ({ page }) => {
      await page.locator('#email').fill('sam')
      await page.getByRole('button', { name: domain, exact: true }).click()

      await expect(page.locator('#email')).toHaveValue(`sam${domain}`)
    })
  }

  test('replace a partially typed domain instead of doubling the @', async ({ page }) => {
    await page.locator('#email').fill('jane@gm')
    await page.getByRole('button', { name: '@yahoo.com' }).click()

    await expect(page.locator('#email')).toHaveValue('jane@yahoo.com')
  })

  test('are visible while the field is empty', async ({ page }) => {
    await expect(domainButtons(page)).toHaveCount(DOMAINS.length)
  })

  test('hide on the key press that completes a valid address and return when it breaks', async ({ page }) => {
    const email = page.locator('#email')
    await email.focus()
    await page.keyboard.type('jane@example.c')
    await expect(domainButtons(page)).toHaveCount(DOMAINS.length)

    await page.keyboard.type('o')
    await expect(domainButtons(page)).toHaveCount(0)

    await page.keyboard.press('Backspace')
    await expect(domainButtons(page)).toHaveCount(DOMAINS.length)
  })

  test('hide after a shortcut completes the address', async ({ page }) => {
    await page.locator('#email').fill('jane')
    await page.getByRole('button', { name: '@gmail.com' }).click()

    await expect(domainButtons(page)).toHaveCount(0)
  })

  test('error message appears below the buttons without moving them', async ({ page }) => {
    const first = domainButtons(page).first()
    const before = await first.boundingBox()

    await page.locator('#email').fill('jane@')
    const withValue = await first.boundingBox()
    await page.locator('#email').blur()
    await expect(invalidFeedback(page, 'email')).toBeVisible()
    const after = await first.boundingBox()
    const feedback = await invalidFeedback(page, 'email').boundingBox()

    expect(after.y).toBe(before.y)
    expect(after.y).toBe(withValue.y)
    expect(feedback.y).toBeGreaterThan(after.y + after.height - 1)
  })
})

test.describe('phone', () => {
  test('discards non-numeric characters as the user types', async ({ page }) => {
    const phone = page.locator('#phone')
    await phone.focus()
    await page.keyboard.type('(214) 555-0199 ext.abc')

    await expect(phone).toHaveValue('2145550199')
  })

  test('stops accepting digits after 10', async ({ page }) => {
    const phone = page.locator('#phone')
    await phone.focus()
    await page.keyboard.type('21455501991234')

    await expect(phone).toHaveValue('2145550199')
  })

  test('drops a pasted +1 country code', async ({ page }) => {
    await page.locator('#phone').fill('+1 (214) 555-0199')

    await expect(page.locator('#phone')).toHaveValue('2145550199')
  })

  test('requires exactly 10 digits, flagged on blur', async ({ page }) => {
    const phone = page.locator('#phone')
    await phone.focus()
    await page.keyboard.type('214555019')
    await expect(phone).not.toHaveClass(/is-invalid/)

    await phone.blur()
    await expect(invalidFeedback(page, 'phone')).toHaveText('Phone number must be exactly 10 digits.')

    await phone.focus()
    await page.keyboard.type('9')
    await phone.blur()
    await expect(phone).not.toHaveClass(/is-invalid/)
  })

  test('is optional', async ({ page }) => {
    await page.locator('#phone').focus()
    await page.locator('#phone').blur()

    await expect(page.locator('#phone')).not.toHaveClass(/is-invalid/)
  })
})

test.describe('zip code', () => {
  test('discards non-numeric characters and caps at 5 digits', async ({ page }) => {
    const zip = page.locator('#zip')
    await zip.focus()
    await page.keyboard.type('75-2a0 1999')

    await expect(zip).toHaveValue('75201')
  })

  test('requires exactly 5 digits, flagged on blur', async ({ page }) => {
    const zip = page.locator('#zip')
    await zip.focus()
    await page.keyboard.type('7520')
    await expect(zip).not.toHaveClass(/is-invalid/)

    await zip.blur()
    await expect(invalidFeedback(page, 'zip')).toHaveText('Zip code must be exactly 5 digits.')

    await zip.focus()
    await page.keyboard.type('1')
    await zip.blur()
    await expect(zip).not.toHaveClass(/is-invalid/)
  })

  test('is optional', async ({ page }) => {
    await page.locator('#zip').focus()
    await page.locator('#zip').blur()

    await expect(page.locator('#zip')).not.toHaveClass(/is-invalid/)
  })
})

test.describe('submit', () => {
  test('shows every error and does not call the API when the form is invalid', async ({ page }) => {
    const calls = await mockApi(page)
    await page.locator('#email').fill('bad')
    await page.locator('#phone').fill('123')
    await page.locator('#zip').fill('12')
    // Blur first: the zip feedback shifts the button, which would swallow the click
    await page.locator('#zip').blur()
    await submitCheckin(page)

    for (const id of ['name', 'email', 'phone', 'zip']) {
      await expect(page.locator(`#${id}`)).toHaveClass(/is-invalid/)
    }
    await expect(page).toHaveURL(/#\/checkin\/1003$/)
    expect(calls.search).toHaveLength(0)
  })

  test('submits with only a name', async ({ page }) => {
    await page.locator('#name').fill('Taylor Swift')
    await submitCheckin(page)

    await expect(page).toHaveURL(/#\/confirmation$/)
  })

  test('has no native validation tooltips (custom feedback only)', async ({ page }) => {
    await expect(page.locator('form')).toHaveAttribute('novalidate', '')
  })
})
