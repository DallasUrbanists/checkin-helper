<script setup>
import Header from '../components/AppHeader.vue'
import Footer from '../components/AppFooter.vue'
</script>

<template>
  <Header />
  <div class="container py-4 pt-0 px-3 mx-auto">

    <RouterView />

    <Footer />
  </div>
</template>
