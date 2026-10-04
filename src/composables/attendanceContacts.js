import { contactFor } from './eventDrafts.js'

// Embedded attendance contacts can omit revisions; fetch values and revision together.
export async function resolveAttendanceContacts(rows, getContact) {
  const contacts = new Map()
  for (const row of rows) {
    const contact = contactFor(row)
    const id = row.contact_id ?? contact?.id
    if (contact && id != null && !contact.revision && !contacts.has(String(id))) {
      contacts.set(String(id), getContact(id))
    }
  }
  const resolved = new Map(await Promise.all([...contacts].map(async ([id, response]) => [id, await response])))
  return rows.map(row => {
    const id = row.contact_id ?? contactFor(row)?.id
    return resolved.has(String(id)) ? { ...row, contact: resolved.get(String(id)) } : row
  })
}
