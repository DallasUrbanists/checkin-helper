<script setup>
import { useRouter } from 'vue-router'
import LoadingInterstitial from '../components/LoadingInterstitial.vue'
import { useCheckin } from '../composables/useCheckin.js'
import { visibleEmails, visiblePhones, visibleZip } from '../composables/contactUtils.js'

const router = useRouter()
const { state, chooseMatch, createNewContact } = useCheckin()

// Direct visits (or reloads) have no submitted form to compare against
if (!state.form || !state.matches.length) router.replace('/')

async function go(action) {
  const location = await action()
  if (location) router.push(location)
}
</script>

<template>
  <main v-if="state.form">
    <h2 class="h3 mb-3">Are one of these you?</h2>

    <div v-if="state.error" class="alert alert-danger" role="alert">{{ state.error }}</div>

    <div class="list-group mb-3">
      <button
        v-for="contact in state.matches"
        :key="contact.id"
        type="button"
        class="list-group-item list-group-item-action py-3"
        :disabled="state.busy"
        @click="go(() => chooseMatch(contact))"
      >
        <div class="fw-semibold">{{ contact.name }}</div>
        <div v-for="email in visibleEmails(contact, state.form)" :key="email" class="text-muted small">
          {{ email }}
        </div>
        <div v-for="phone in visiblePhones(contact, state.form)" :key="phone" class="text-muted small">
          {{ phone }}
        </div>
        <div v-if="visibleZip(contact, state.form)" class="text-muted small">
          {{ visibleZip(contact, state.form) }}
        </div>
      </button>
    </div>

    <button
      type="button"
      class="btn btn-outline-secondary w-100"
      :disabled="state.busy"
      @click="go(createNewContact)"
    >
      None of those are me
    </button>

    <LoadingInterstitial v-if="state.busy" />
  </main>
</template>
