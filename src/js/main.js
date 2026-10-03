import { createApp } from 'vue'
import App from './App.vue'
import router, { installAuthGuard } from './router.js'

installAuthGuard(router)

// Import our custom CSS
import '../scss/styles.scss'

createApp(App).use(router).mount('#app')
