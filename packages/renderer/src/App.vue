<script lang="ts" setup>
import { NLayout } from 'naive-ui';
import { onBeforeMount } from 'vue';
import { useRouter } from 'vue-router';
import NaiveProvider from './components/NaiveProvider.vue';
import SidebarMenu from './layouts/SidebarMenuLayout.vue';
import { useGlobalStore } from './stores/global';
import { useProjectsStore } from './stores/projects';
import { type Project } from '../../main/src/data/Configuration/Projects';

onBeforeMount(async () => {

    const store = useGlobalStore();
    const projectsStore = useProjectsStore();

    // Initialize Config
    await store.getConfig();

    // Initialize Projects
    const recentProjects = store.config.recentlyOpenedProjects;
    projectsStore.projects = await window.projectsApi['list-projects'](recentProjects.map(project => project.path));

    // Initialize Project Task Queue Map
    projectsStore.projectQueueMap = projectsStore.projects.reduce((map, project: Project) => {
        map[project.id] = {
            status: 'idle',
        };
        for (const task of project.tasks) {
            const lastStatus = task.statusHistory.length ? task.statusHistory[task.statusHistory.length - 1].state : 'idle';
        
            if (lastStatus !== 'idle') {
                map[project.id] = {
                    taskId: task.id,
                    status: 'paused',
                };

                break;
            }
        }

        return map;
    }, {} as typeof projectsStore.projectQueueMap);
});

const router = useRouter();
router.push('/');

</script>

<template>
    <title>Av1ation Station</title>
    <suspense>
        <NaiveProvider>
            <NLayout
                position="absolute"
                has-sider
            >
                <SidebarMenu />
                <RouterView />
            </NLayout>
        </naiveprovider>
    </suspense>
</template>

<style>
</style>
