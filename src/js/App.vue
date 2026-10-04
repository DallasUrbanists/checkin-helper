<script setup>
import Header from '../components/AppHeader.vue'
import Footer from '../components/AppFooter.vue'
import OperationToastHost from '../components/OperationToastHost.vue'
import { useEventOperations } from '../composables/eventOperations.js'

const { busy } = useEventOperations()
</script>

<template>
  <Header :inert="busy" />
  <div class="container py-4 pt-0 px-3 mx-auto">
    <OperationToastHost />
    <div :inert="busy" :aria-busy="busy">
      <RouterView />
      <Footer />
    </div>
  </div>
</template>
