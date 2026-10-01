<script setup>
defineProps({
  message: { type: String, default: 'Checking in...' }
})
</script>

<template>
  <div
    class="loading-interstitial position-fixed top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center bg-body bg-opacity-75"
    role="status"
    aria-live="polite"
  >
    <div class="spinner-border text-primary mb-3" aria-hidden="true"></div>
    <p class="fs-5 mb-0">{{ message }}</p>
  </div>
</template>
