export function phoneDigits(phone) {
  const digits = String(phone).replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

export function toStoragePhone(digits) {
  return `+1-${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
}

export function displayPhone(digits) {
  return digits.length === 10
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : digits
}

export function censorPhone(digits) {
  if (digits.length !== 10) return '*'.repeat(digits.length)
  return displayPhone(digits.slice(0, 2) + '*'.repeat(6) + digits.slice(-2))
}

function maskHandle(handle) {
  if (handle.length <= 2) return handle
  return handle[0] + '*'.repeat(handle.length - 2) + handle.at(-1)
}

export function censorEmail(email) {
  const at = email.lastIndexOf('@')
  if (at < 1) return '*'.repeat(email.length)
  const domain = email.slice(at + 1)
  const dot = domain.lastIndexOf('.')
  const maskedDomain = dot < 1
    ? domain[0] + '*'.repeat(domain.length - 1)
    : domain[0] + '*'.repeat(dot - 1) + domain.slice(dot)
  return `${maskHandle(email.slice(0, at))}@${maskedDomain}`
}

export function toCreatePayload(form) {
  const payload = { name: form.name }
  if (form.email) payload.emails = [form.email]
  if (form.phone) payload.phones = [toStoragePhone(form.phone)]
  if (form.zip) payload.zip_home = form.zip
  return payload
}

// Returns an UpdateContactDTO, or null when the contact already has everything provided.
export function buildContactUpdate(contact, form) {
  const emails = [...(contact.emails ?? [])]
  const phones = [...(contact.phones ?? [])]
  const zipOther = [...(contact.zip_other ?? [])]
  let zipHome = contact.zip_home || ''
  let changed = false

  if (form.email && !emails.some(e => e.toLowerCase() === form.email)) {
    emails.push(form.email)
    changed = true
  }

  if (form.phone && !phones.some(p => phoneDigits(p) === form.phone)) {
    phones.push(toStoragePhone(form.phone))
    changed = true
  }

  if (form.zip) {
    if (!zipHome) {
      zipHome = form.zip
      changed = true
    } else if (form.zip !== zipHome && !zipOther.includes(form.zip)) {
      zipOther.push(form.zip)
      changed = true
    }
  }

  if (!changed) return null

  const payload = { name: contact.name, emails, phones, zip_other: zipOther }
  if (zipHome) payload.zip_home = zipHome
  if (contact.roles) payload.roles = contact.roles
  return payload
}

// Full value only when it exactly matches what was submitted; otherwise censored.
export function visibleEmails(contact, form) {
  return (contact.emails ?? []).map(e => (e.toLowerCase() === form.email ? e : censorEmail(e)))
}

export function visiblePhones(contact, form) {
  return (contact.phones ?? []).map(p => {
    const digits = phoneDigits(p)
    return digits === form.phone ? displayPhone(digits) : censorPhone(digits)
  })
}

// Zip is never shown unless it matches the submitted zip.
export function visibleZip(contact, form) {
  if (!form.zip) return ''
  const known = [contact.zip_home, ...(contact.zip_other ?? [])]
  return known.includes(form.zip) ? form.zip : ''
}
