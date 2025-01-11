// Notice: typescript and vue-tsc pinned to 5.6.2 and 2.0.29 respectively until vue-tsc and/or volar support 5.7.2 (see: https://github.com/vuejs/language-tools/issues/5018#issuecomment-2494783497)

import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import {
    type RouteRecordRaw,
    createRouter,
    createWebHistory,
} from 'vue-router';
import HomeLayoutVue from './layouts/HomeLayout.vue';
import ProjectLayout from './layouts/ProjectLayout.vue';
import TaskLayout from './layouts/TaskLayout.vue';
import SettingsLayout from './layouts/SettingsLayout.vue';
import TaskStatusHistoryLayout from './layouts/TaskStatusHistoryLayout.vue';
import TaskLogLayout from './layouts/TaskLogLayout.vue';
import NotificationsLayout from './layouts/NotificationsLayout.vue';

// Define routes
const routes: RouteRecordRaw[] = [
    {
        path: '/',
        component: HomeLayoutVue,
    },
    {
        path: '/projects/:projectId',
        component: ProjectLayout,
    },
    {
        path: '/projects/:projectId/tasks/:taskId',
        component: TaskLayout,
    },
    {
        path: '/projects/:projectId/tasks/:taskId/status-history',
        component: TaskStatusHistoryLayout,
    },
    {
        path: '/projects/:projectId/tasks/:taskId/av1an-logs',
        component: TaskLogLayout,
    },
    {
        path: '/settings',
        component: SettingsLayout,
    },
    {
        path: '/notifications',
        component: NotificationsLayout,
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
