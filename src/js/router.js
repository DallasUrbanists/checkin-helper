import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import CheckinView from '../views/CheckinView.vue'
import MatchesView from '../views/MatchesView.vue'
import ConfirmationView from '../views/ConfirmationView.vue'

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/checkin/:eventId', name: 'checkin', component: CheckinView },
    { path: '/checkin/:eventId/matches', name: 'matches', component: MatchesView },
    { path: '/confirmation', name: 'confirmation', component: ConfirmationView },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})
