import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from '/@/App.vue';
import {
    type RouteRecordRaw,
    createRouter,
    createWebHistory,
} from 'vue-router';
import HomeLayoutVue from '/@/layouts/HomeLayout.vue';
import ProjectLayout from '/@/layouts/ProjectLayout.vue';
import TaskLayout from '/@/layouts/TaskLayout.vue';
import SettingsLayout from '/@/layouts/SettingsLayout.vue';

// Define routes
const routes: RouteRecordRaw[] = [
    {
        path: '/',
        component: HomeLayoutVue,
    },
    {
        path: '/projects/:projectId',
        component: ProjectLayout,
        children: [
            {
                path: 'tasks/:taskId',
                component: TaskLayout,
            },
        ],
    },
    {
        path: '/settings',
        component: SettingsLayout,
    },
];

const router = createRouter({
    history: createWebHistory(),
    routes,
});

createApp(App)
    .use(router)
    .use(createPinia())
    .mount('#app');
