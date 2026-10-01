import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'

// Import our custom CSS
import '../scss/styles.scss'

createApp(App).use(router).mount('#app')
