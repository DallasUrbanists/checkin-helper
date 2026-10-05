import { reactive } from 'vue'
import { useApi } from './useApi.js'
import { buildContactUpdate, toCreatePayload } from './contactUtils.js'

const state = reactive({
  busy: false,
  error: '',
  eventId: '',
  form: null,
  matches: [],
  contact: null,
  alreadyCheckedIn: false
})

async function run(task) {
  if (state.busy) return null
  state.busy = true
  state.error = ''
  try {
    return await task()
  } catch (e) {
    state.error = e.message || 'Something went wrong. Please try again.'
    return null
  } finally {
    state.busy = false
  }
}

async function finish(contact) {
  const api = useApi()
  state.alreadyCheckedIn = false
  try {
    await api.createCheckin({ contact_id: contact.id, event_id: state.eventId })
  } catch (error) {
    if (!/\balready checked[ -]in\b/i.test(error.message)) throw error
    state.alreadyCheckedIn = true
  }
  state.contact = contact
  state.matches = []
  return { name: 'confirmation' }
}

async function updateIfNeeded(contact) {
  const payload = buildContactUpdate(contact, state.form)
  return payload ? useApi().updateContact(contact.id, payload) : contact
}

// Each action resolves to a route location to navigate to, or null on failure.
function submit(eventId, form) {
  return run(async () => {
    state.eventId = eventId
    state.form = form
    state.contact = null
    state.matches = []
    state.alreadyCheckedIn = false

    const matches = await useApi().searchContacts(form.name)
    if (matches.length > 1) {
      state.matches = matches
      return { name: 'matches', params: { eventId } }
    }
    const contact = matches.length
      ? await updateIfNeeded(matches[0])
      : await useApi().createContact(toCreatePayload(form))
    return finish(contact)
  })
}

function chooseMatch(contact) {
  return run(async () => finish(await updateIfNeeded(contact)))
}

function createNewContact() {
  return run(async () => finish(await useApi().createContact(toCreatePayload(state.form))))
}

function reset() {
  state.error = ''
  state.form = null
  state.matches = []
  state.contact = null
  state.alreadyCheckedIn = false
}

export function useCheckin() {
  return { state, submit, chooseMatch, createNewContact, reset }
}
