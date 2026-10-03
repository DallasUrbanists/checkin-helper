import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import CheckinView from '../views/CheckinView.vue'
import MatchesView from '../views/MatchesView.vue'
import ConfirmationView from '../views/ConfirmationView.vue'
import LoginView from '../views/LoginView.vue'
import EventView from '../views/EventView.vue'
import UserProfileView from '../views/UserProfileView.vue'
import ContactProfileView from '../views/ContactProfileView.vue'
import EditUserView from '../views/EditUserView.vue'
import { useAuth } from '../composables/firebase.js'

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/checkin/:eventId', name: 'checkin', component: CheckinView },
    { path: '/checkin/:eventId/matches', name: 'matches', component: MatchesView },
    { path: '/confirmation', name: 'confirmation', component: ConfirmationView },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/events/:eventId', name: 'event', component: EventView },
    { path: '/event/:eventId', redirect: to => ({ name: 'event', params: to.params }) },
    { path: '/profile', name: 'profile', component: UserProfileView, meta: { requiresAuth: true } },
    { path: '/user/profile', redirect: '/profile' },
    { path: '/profile/edit', name: 'profile-edit', component: EditUserView, meta: { requiresAuth: true } },
    { path: '/user/edit', redirect: '/profile/edit' },
    { path: '/contacts/:contactId', name: 'contact-profile', component: ContactProfileView, meta: { requiresAuth: true } },
    { path: '/contact/:contactId', redirect: to => ({ name: 'contact-profile', params: to.params }) },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

export function installAuthGuard(router) {
  router.beforeEach((to) => {
    if (!to.meta.requiresAuth) return true
    const { user, ready } = useAuth()
    if (ready.value && !user.value) return { name: 'login', query: { redirect: to.fullPath } }
    return true
  })
}
