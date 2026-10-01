const EMAIL_LOCAL_CHARS = "A-Za-z0-9.!#$%&'*+/=?^_`{|}~\\-"
const EMAIL_PATTERN = new RegExp(
  `^[${EMAIL_LOCAL_CHARS}]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\\.[a-z]{2,}$`,
  'i'
)

export function normalizeName(value) {
  return value.trim().replace(/\s+/g, ' ')
}

export function sanitizeEmail(value) {
  const cleaned = value.replace(new RegExp(`[^${EMAIL_LOCAL_CHARS}@]`, 'g'), '').toLowerCase()
  const at = cleaned.indexOf('@')
  if (at < 0) return cleaned
  const domain = cleaned.slice(at + 1).replace(/[^a-z0-9.-]/g, '')
  return `${cleaned.slice(0, at)}@${domain}`
}

export function sanitizeDigits(value, max) {
  return value.replace(/\D/g, '').slice(0, max)
}

// Drops a pasted leading country code (+1 / 1) before trimming to 10 digits
export function sanitizePhone(value) {
  const digits = value.replace(/\D/g, '')
  return (digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits).slice(0, 10)
}

export function validateName(value) {
  const name = normalizeName(value)
  if (!name) return 'Name is required.'
  if (name.length < 2) return 'Name must be at least 2 characters.'
  if (name.length > 64) return 'Name must be 64 characters or fewer.'
  if (name.split(' ').length > 6) return 'Name must be 6 words or fewer.'
  return ''
}

export function validateEmail(value) {
  if (!value) return ''
  const [local] = value.split('@')
  const valid = value.length <= 254
    && EMAIL_PATTERN.test(value)
    && !local.startsWith('.')
    && !local.endsWith('.')
    && !value.includes('..')
  return valid ? '' : 'Enter a valid email address.'
}

export function validatePhone(value) {
  if (!value) return ''
  return /^\d{10}$/.test(value) ? '' : 'Phone number must be exactly 10 digits.'
}

export function validateZip(value) {
  if (!value) return ''
  return /^\d{5}$/.test(value) ? '' : 'Zip code must be exactly 5 digits.'
}
