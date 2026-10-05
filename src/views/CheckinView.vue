<script setup>
import { computed, onMounted, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LoadingInterstitial from '../components/LoadingInterstitial.vue'
import { useCheckin } from '../composables/useCheckin.js'
import { useEvents, formatEventDate } from '../composables/useEvents.js'
import {
  normalizeName,
  sanitizeEmail,
  sanitizeDigits,
  sanitizePhone,
  validateName,
  validateEmail,
  validatePhone,
  validateZip
} from '../composables/validation.js'

const EMAIL_DOMAINS = [
  '@gmail.com',
  '@yahoo.com',
  '@outlook.com',
  '@icloud.com',
  '@hotmail.com',
  '@proton.me',
]

const route = useRoute()
const router = useRouter()
const { state, submit } = useCheckin()
const { status, error: loadError, load, findEvent } = useEvents()

const eventId = String(route.params.eventId)
const event = computed(() => findEvent(eventId))

const form = reactive({ name: '', email: '', phone: '', zip: '' })
const errors = reactive({ name: '', email: '', phone: '', zip: '' })
const storageKey = `checkin-form-${eventId}`

const validators = {
  name: validateName,
  email: validateEmail,
  phone: validatePhone,
  zip: validateZip
}

// Recomputed on every input event, so it tracks each key press.
const showDomains = computed(() => !form.email || !!validateEmail(form.email))

onMounted(() => {
  load()
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || 'null')
    if (saved && typeof saved === 'object') Object.assign(form, saved)
  } catch {
    window.localStorage.removeItem(storageKey)
  }
})

watch(form, (value) => {
  window.localStorage.setItem(storageKey, JSON.stringify(value))
}, { deep: true })

// Feedback appears on blur and is cleared again once the user resumes typing.
function validateField(field) {
  errors[field] = validators[field](form[field])
}

function onName(e) {
  form.name = e.target.value
  errors.name = ''
}

function onEmail(e) {
  form.email = sanitizeEmail(e.target.value)
  e.target.value = form.email
  errors.email = ''
}

function onPhone(e) {
  form.phone = sanitizePhone(e.target.value)
  e.target.value = form.phone
  errors.phone = ''
}

function onZip(e) {
  form.zip = sanitizeDigits(e.target.value, 5)
  e.target.value = form.zip
  errors.zip = ''
}

function appendDomain(domain) {
  // Replaces a partially typed domain so the result is never "a@b@c.com"
  form.email = form.email.split('@')[0] + domain;
  errors.email = '';
}

async function onSubmit() {
  Object.keys(validators).forEach(validateField)
  if (Object.values(errors).some(Boolean)) return

  const location = await submit(eventId, {
    name: normalizeName(form.name),
    email: form.email,
    phone: form.phone,
    zip: form.zip
  })
  if (location) router.push(location)
}
</script>

<template>
  <main>
    <div v-if="status === 'loading' || status === 'idle'" class="d-flex align-items-center" role="status">
      <div class="spinner-border spinner-border-sm me-2" aria-hidden="true"></div>
      Loading event...
    </div>

    <div v-else-if="status === 'error'" class="alert alert-danger" role="alert">{{ loadError }}</div>

    <div v-else-if="!event" class="alert alert-warning" role="alert">
      That event could not be found. <RouterLink to="/">Pick an event</RouterLink>
    </div>

    <template v-else>
      <h2 class="h3 mb-0">Check in</h2>
      <p class="mb-2 text-muted small">{{ formatEventDate(event) }}</p>

      <div v-if="state.error" class="alert alert-danger" role="alert">{{ state.error }}</div>

      <form novalidate @submit.prevent="onSubmit">
        <div class="form-floating mb-3">
          <input id="name" :value="form.name" type="text" class="form-control" placeholder="Name"
            :class="{ 'is-invalid': errors.name }" autocomplete="off" required :aria-invalid="!!errors.name"
            aria-describedby="name-feedback" @input="onName" @blur="validateField('name')">
          <label for="name">Name <span class="text-muted">(required)</span></label>
          <div id="name-feedback" class="invalid-feedback">{{ errors.name }}</div>
        </div>

        <div class="mb-3">
          <div class="form-floating">
            <input id="email" :value="form.email" type="text" inputmode="email" class="form-control" placeholder="Email"
              :class="{ 'is-invalid': errors.email }" autocomplete="off" autocapitalize="none" spellcheck="false"
              :aria-invalid="!!errors.email" aria-describedby="email-feedback" @input="onEmail"
              @blur="validateField('email')">
            <label for="email">Email</label>
          </div>
          <div v-if="showDomains" class="d-flex flex-wrap gap-1 mt-2">
            <button v-for="domain in EMAIL_DOMAINS" :key="domain" type="button" class="btn btn-sm btn-outline-secondary"
              @click="appendDomain(domain)">
              {{ domain }}
            </button>
          </div>
          <div id="email-feedback" class="invalid-feedback" :class="{ 'd-block': errors.email }">{{ errors.email }}</div>
        </div>

        <div class="form-floating mb-3">
          <input id="phone" :value="form.phone" type="text" inputmode="numeric" class="form-control" placeholder="Phone"
            :class="{ 'is-invalid': errors.phone }" autocomplete="off" :aria-invalid="!!errors.phone"
            aria-describedby="phone-feedback" @input="onPhone" @blur="validateField('phone')">
          <label for="phone">Phone</label>
          <div id="phone-feedback" class="invalid-feedback">{{ errors.phone }}</div>
        </div>

        <div class="form-floating mb-3">
          <input id="zip" :value="form.zip" type="text" inputmode="numeric" class="form-control" placeholder="Zip code"
            :class="{ 'is-invalid': errors.zip }" autocomplete="off" :aria-invalid="!!errors.zip"
            aria-describedby="zip-feedback" @input="onZip" @blur="validateField('zip')">
          <label for="zip">Zip code</label>
          <div id="zip-feedback" class="invalid-feedback">{{ errors.zip }}</div>
        </div>

        <button type="submit" class="btn btn-primary btn-lg w-100" :disabled="state.busy">Check in</button>
      </form>
    </template>

    <LoadingInterstitial v-if="state.busy" />
  </main>
</template>
