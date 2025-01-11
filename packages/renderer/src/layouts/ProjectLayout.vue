<script setup lang="ts">
import {
    onBeforeRouteUpdate,
    useRouter,
} from 'vue-router';
import {
    NFlex,
    NLayout,
} from 'naive-ui';
import { useProjectsStore } from '../stores/projects';
import ProjectBreadcrumb from '../components/ProjectBreadcrumb.vue';
import ProjectDetail from '../components/Projects/ProjectDetail.vue';
import TaskQueue from '../components/Projects/TaskQueue.vue';
import ConfigurationDefaults from '../components/Configuration/ConfigurationDefaults.vue';
import ConfigurationFloatingButtons from '../components/Configuration/ConfigurationFloatingButtons.vue';
import { onBeforeMount, toRaw } from 'vue';

const router = useRouter();

// Redirect if no project id
onBeforeRouteUpdate((to, _from) => {
    if (!to.params.projectId) {
        router.push('/');
        return;
    }
});

onBeforeMount(async () => {
    const projectsStore = useProjectsStore();
    const project = projectsStore.projects.find((project) => project.id === router.currentRoute.value.params.projectId);
    const projectIndex = projectsStore.projects.findIndex((project) => project.id === router.currentRoute.value.params.projectId);

    if (projectIndex === -1) {
        router.push('/');
        return;
    }

    if (project) {
        await projectsStore.loadProject(toRaw(projectsStore.projects[projectIndex]).path);
    }
});

// Get project id from route
const { projectId } = router.currentRoute.value.params;

const projectsStore = useProjectsStore();
const projectIndex = projectsStore.projects.findIndex((project) => project.id === projectId);

if (projectIndex === -1) {
    router.push('/');
}

const project = projectsStore.projects[projectIndex];

</script>

<template>
    <!-- TODO: Add layout sider for links to editing defaults and applying them -->
    <!-- TODO: Add header for queue statistics -->
    <NLayout
        content-style="padding: 24px;"
        :native-scrollbar="false"
    >
        <NFlex
            vertical
        >
            <ProjectBreadcrumb
                :project-id="project.id"
            />
            <ProjectDetail
                :project-id="project.id"
            />
            <ConfigurationDefaults
                :project-id="project.id"
            />
            <TaskQueue
                :project-id="project.id"
            />
        </NFlex>
    </NLayout>
    <ConfigurationFloatingButtons
        :project-id="project.id"
    />
</template>
