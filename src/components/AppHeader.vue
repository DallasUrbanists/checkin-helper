<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEvents } from '../composables/useEvents.js'
import { useCheckin } from '../composables/useCheckin.js'
import { useAuth } from '../composables/firebase.js'

const { user, initials, signOut } = useAuth()
const route = useRoute()
const router = useRouter()
const { findEvent, load } = useEvents()
const { state: checkinState } = useCheckin()

onMounted(load)

const isHome = computed(() => route.name === 'home' || route.path === '/')

const eventId = computed(() => {
  return (route.params.eventId ? String(route.params.eventId) : '') || checkinState.eventId || ''
})

const event = computed(() => {
  return eventId.value ? findEvent(eventId.value) : null
})

const eventTitle = computed(() => {
  return event.value?.title || ''
})

function goBack() {
  if (window.history.state?.back) {
    router.back()
  } else {
    router.push('/')
  }
}
</script>

<template>
  <header class="sticky-top mb-3">
    <nav class="navbar navbar-expand navbar-light bg-secondary text-light px-2 py-2 shadow-sm" style="height: 52px;" data-bs-theme="dark">
      <div class="container-fluid p-0 d-flex align-items-center">
        <template v-if="isHome">
          <RouterLink to="/" class="navbar-brand d-flex align-items-center mb-0 text-decoration-none" aria-label="Home">
            <svg id="Layer_1" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 1000.7 848.9" width="34" height="34" class="me-2 flex-shrink-0">
              <g fill="#ffa800">
                <path d="M398.7,543.3l-86.3,161.9h83.6l86.3-140.3h0c62.7,33.4,110.6,89.7,133.9,157.2l13.5,39.1c7.4,21.2,28,34.7,50.2,32.4l38.1-3.7-40.1-150.4c-9.4-35.8-28.7-68.5-55.3-94.4h0c-51.6-50.2-72.2-124.1-54-193.6h0c22.3,31,56,51.6,93.8,57.7l67.8,10.8h0c11.5-27.6-3.7-59-32.4-67.1h0c-30-8.4-55-28.7-69.5-56.3-15.2-29-34.7-62.7-47.2-87.4-11.1-20.9-39.5-27.3-61-20.9-22.9,9.4-44.9,20.9-67.1,32h0c-25.3,13.1-51.6,27.3-72.9,38.8h-.3c-27.6,15.5-47.2,42.2-53.3,73.2l-13.5,69.8c-4.4,22.9,16.2,42.5,38.8,36.8h0l27-74.2c9.1-25.3,28.3-45.5,53-56.3h0l-13.5,160.5c-2,25.6-8.8,50.9-19.2,74.5h-.3Z"/>
                <path d="M531.9,116.3c4.7-74.2,102.5-67.4,108.3-5.7,4.7,77.9-106.2,78.9-108.3,5.7Z"/>
                <path d="M158.9,396.3v452.6h452.6l-72.8-93.7c-9.5-12.2-24-19.3-39.5-19.3h-195c-13.7,0-24.9-11.1-24.9-24.9v-175.1c0-13.4-5.4-26.2-14.9-35.6l-105.5-104Z"/>
                <path d="M482.3,118.7c1-16.9,4.7-31.4,10.1-43.8H74.9c0,24.4,19.8,44.2,44.2,44.2h363.3v-.3Z"/>
                <path d="M847.6,201.7c-41.8-52.2-97.9-92.1-160.3-114.8l2.7,20.5v1c0,0,.8,11.2.8,11.2.6,10.1,6.6,19.1,15.7,23.6,106.2,52.6,175.8,161.2,175.8,284.1s-41.7,184.6-108.4,239.6c-20.6,16.9-29.3,44.4-22.1,70h0c35.8-21.6,67.8-49.2,94.4-82,51.9-64.1,80.6-145,80.6-227.6s-27.3-160.5-78.9-225.3l-.3-.3h0Z"/>
                <path d="M808.5,402c.7,8.1,1.3,16.2,1.3,24.3,0,60.6-23.2,117.2-61.7,160.4-18.1,20.3-25,48.2-17.7,74.3v.3h0c22.3-15.5,42.5-34.1,60-55.3,41.1-50.6,63.4-114.3,63.4-179.4s-22.3-127.5-62.4-177.7c-29.3-37.1-67.8-65.8-111-84.3h0c0,.1-.1.3-.2.4-9.6,20.9-2.5,45.6,17,57.9,50.3,31.6,87.2,80.9,103.2,138.7"/>
                <path d="M407.8,174.7h0l50-25.9h0s-308,0-308,0c0,24.4,19.8,44.2,44.2,44.2h141.2c25.3,0,50.2-6.2,72.6-18l.3-.2h-.3,0Z"/>
                <path d="M904.9,152.4C844.5,76.9,760.2,22.9,667.1.7h0c-1.8-.4-3.6-.7-5.5-.7H.3C.3,24.4,20.1,44.2,44.5,44.2h473.9c38.5-30.7,95.8-28.7,134.2,0h0c4.5,0,9,.5,13.3,1.7,171.2,45.7,289.9,199.5,289.9,377.7s-62.4,249.9-159.8,316c-21.6,14.7-31.2,41.7-24.1,66.8h0c50.2-27.3,95.1-64.1,131.2-108.9,62.7-77.2,97.1-174.4,97.1-273.9s-33.7-194.6-95.1-271.1h-.3,0Z"/>
              </g>
            </svg>
            <span class="navbar-text  p-0 text-truncate" aria-role="heading">Choose event</span>
          </RouterLink>
        </template>
        <template v-else>
          <div class="d-flex align-items-center w-100">
            <button
              type="button"
              class="btn btn-link link-light p-0 me-2 d-inline-flex align-items-center text-decoration-none"
              aria-label="Back"
              @click="goBack"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" fill="white" viewBox="0 0 16 16" aria-hidden="true">
                <path fill-rule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8"/>
              </svg>
            </button>
            <span v-if="eventTitle" class="navbar-text  p-0 text-truncate" aria-role="heading">{{ eventTitle }}</span>
          </div>
        </template>
        <div class="ms-auto d-flex align-items-center gap-2">
          <RouterLink v-if="isHome && user" to="/profile" class="btn btn-sm btn-outline-light rounded-circle" :aria-label="`Profile for ${user.email || 'user'}`">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="me-1" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0"/><path fill-rule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m8-7a7 7 0 0 0-5.468 11.368C3.242 11.226 5.017 10.5 8 10.5s4.758.726 5.468 1.868A7 7 0 0 0 8 1"/>
            </svg>{{ initials }}
          </RouterLink>
          <RouterLink v-else-if="isHome" to="/login" class="btn btn-sm btn-outline-light">Login</RouterLink>
          <RouterLink v-if="route.name === 'profile'" to="/profile/edit" class="btn btn-sm btn-outline-light">Edit</RouterLink>
          <button v-if="user && route.name === 'profile'" type="button" class="btn btn-sm btn-link text-light" @click="signOut">Log out</button>
        </div>
      </div>
    </nav>
  </header>
</template>
