<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCheckin } from '../composables/useCheckin.js'
import { useEvents, formatEventDate } from '../composables/useEvents.js'
import { displayPhone } from '../composables/contactUtils.js'

const router = useRouter()
const { state, reset } = useCheckin()
const { findEvent } = useEvents()

if (!state.contact) router.replace('/')

const event = computed(() => findEvent(state.eventId))

// Shows what was just submitted, never other data stored on a matched contact
const submitted = computed(() => state.form ?? {})

function another() {
  const eventId = state.eventId
  reset()
  router.push({ name: 'checkin', params: { eventId } })
}
</script>

<template>
  <main v-if="state.contact">
    <div class="alert alert-success" role="status">
      <h2 class="h4 alert-heading mb-0">You're checked in!</h2>
    </div>

    <section class="mb-4">
      <h3 class="h5">Event</h3>
      <template v-if="event">
        <div class="fw-semibold">{{ event.title }}</div>
        <div class="text-muted">{{ formatEventDate(event) }}</div>
        <div v-if="event.location" class="text-muted">{{ event.location }}</div>
      </template>
      <div v-else class="text-muted">Event {{ state.eventId }}</div>
    </section>

    <section class="mb-4">
      <h3 class="h5">Contact</h3>
      <div class="fw-semibold">{{ state.contact.name }}</div>
      <div v-if="submitted.email" class="text-muted">{{ submitted.email }}</div>
      <div v-if="submitted.phone" class="text-muted">{{ displayPhone(submitted.phone) }}</div>
      <div v-if="submitted.zip" class="text-muted">{{ submitted.zip }}</div>
    </section>

    <button type="button" class="btn btn-primary btn-lg w-100" @click="another">
      Check in another person
    </button>
  </main>
</template>
