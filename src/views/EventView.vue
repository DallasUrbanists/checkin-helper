<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEvents, formatEventDate } from '../composables/useEvents.js'
import { useApi } from '../composables/useApi.js'

const route = useRoute()
const router = useRouter()
const { findEvent, load } = useEvents()
const checkins = ref([])
const error = ref('')
const loading = ref(true)
const event = computed(() => findEvent(String(route.params.eventId)))
const isMultiDay = computed(() => Boolean(event.value?.end && event.value.end.toDateString() !== event.value.start.toDateString()))

function checkinContact(checkin) {
  return checkin.contact || checkin.contact_data || null
}

function contactName(checkin) {
  return checkinContact(checkin)?.name || checkin.contact_name || `Contact ${checkin.contact_id || 'anonymous'}`
}

function openContact(checkin) {
  if (checkin.contact_id) router.push({ name: 'contact-profile', params: { contactId: checkin.contact_id } })
}

function formatTime(value) {
  if (!value) return 'Unknown time'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  const options = isMultiDay.value
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: event.value?.timeZone }
    : { hour: 'numeric', minute: '2-digit', timeZone: event.value?.timeZone }
  const formatted = new Intl.DateTimeFormat('en-US', options).format(date)
  if (!isMultiDay.value) return formatted
  return formatted.replace(/(\w+ \d+)(,)?/, (_, day) => `${day}${ordinal(Number(day.match(/\d+/)[0]))}`)
}

function ordinal(day) {
  if (day % 100 >= 11 && day % 100 <= 13) return 'th'
  return ({ 1: 'st', 2: 'nd', 3: 'rd' })[day % 10] || 'th'
}

onMounted(async () => {
  await load()
  try {
    const result = await useApi().getEventCheckins(route.params.eventId)
    checkins.value = Array.isArray(result) ? result : (result?.data || [])
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main>
    <div v-if="!event && !loading" class="alert alert-warning">That event could not be found. <RouterLink to="/">Pick an event</RouterLink></div>
    <template v-else-if="event">
      <h1 class="h3">{{ event.title }}</h1>
      <p class="text-muted">{{ formatEventDate(event) }}</p>
      <p v-if="event.location">{{ event.location }}</p>
      <p v-if="event.description">{{ event.description }}</p>
      <RouterLink class="btn btn-primary mb-4" :to="{ name: 'checkin', params: { eventId: event.id } }">Check in someone</RouterLink>
      <h2 class="h5">Check-ins <span class="badge text-bg-secondary">{{ checkins.length }}</span></h2>
      <div v-if="loading" class="text-muted">Loading check-ins...</div>
      <div v-else-if="error" class="alert alert-warning">{{ error }}</div>
      <div v-else-if="!checkins.length" class="text-muted">No check-ins yet.</div>
      <div v-else class="table-responsive">
        <table class="table table-hover align-middle w-100">
          <thead><tr><th scope="col">Name</th><th scope="col">Zip</th><th scope="col">Time</th></tr></thead>
          <tbody class="table-group-divider">
            <tr v-for="checkin in checkins" :key="checkin.id" class="checkin-row" role="link" tabindex="0" @click="openContact(checkin)" @keydown.enter="openContact(checkin)">
                          <td><span class="text-decoration-underline">{{ contactName(checkin) }}</span></td>
              <td>{{ checkinContact(checkin)?.zip_home || '' }}</td>
              <td>{{ formatTime(checkin.submitted_on || checkin.created_at || checkin.checked_in_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </main>
</template>

<style scoped>
.checkin-row {
  cursor: pointer;
}
</style>
