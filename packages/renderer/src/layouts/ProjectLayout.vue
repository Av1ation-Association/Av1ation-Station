<script setup lang="ts">
import { onBeforeRouteUpdate, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
    NLayout,
    NH1,
    NButton,
    NFlex,
    NDivider,
    NCard,
    NProgress,
    NButtonGroup,
} from 'naive-ui';
import { useProjectsStore } from '../stores/projects';
import { type Project } from '../../../main/src/data/Configuration/Projects';
import ProjectDetail from '../components/Projects/ProjectDetail.vue';
import TaskQueue from '../components/Projects/TaskQueue.vue';
import ConfigurationDefaults from '../components/Configuration/ConfigurationDefaults.vue';

const router = useRouter();

const projectsStore = useProjectsStore();
const { projects } = storeToRefs(projectsStore);

onBeforeRouteUpdate((to, from) => {
    if (!to.params.id) {
        router.push('/');
    }
});

// Get project id from route
const { id } = router.currentRoute.value.params;

const foundProject = projects.value.find((project) => project.id === id);

if (!foundProject) {
    router.push('/');
}

const project = foundProject as Project;

</script>

<template>
    <!-- TODO: Add layout sider for links to editing defaults and applying them -->
    <!-- TODO: Add header for queue statistics -->
    <NLayout
        content-style="padding: 24px;"
    >
        <ProjectDetail
            :project-id="project.id"
        />
        <ConfigurationDefaults
            :project-id="project.id"
        />
        <TaskQueue
            :project-id="project.id"
        />
    </NLayout>
</template>
