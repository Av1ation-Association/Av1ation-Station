<script setup lang="ts">
import { onBeforeRouteUpdate, useRouter } from 'vue-router';
import {
    NLayout,
} from 'naive-ui';
import { useProjectsStore } from '../stores/projects';
import TaskDetail from '../components/Projects/TaskDetail.vue';
import ConfigurationDefaults from '../components/Configuration/ConfigurationDefaults.vue';

const router = useRouter();

const projectsStore = useProjectsStore();

// Redirect if no task or project id
onBeforeRouteUpdate((to, _from) => {
    if (!to.params.taskId) {
        if (!to.params.projectId) {
            router.push('/');
        } else {
            router.push(`/projects/${to.params.projectId}`);
        }
    }
});

// Get project id from route
const { projectId, taskId } = router.currentRoute.value.params;

const projectIndex = projectsStore.projects.findIndex((project) => project.id === projectId);

if (projectIndex === -1) {
    router.push('/');
}

const taskIndex = projectsStore.projects[projectIndex].tasks.findIndex((task) => task.id === taskId);

if (taskIndex === -1) {
    router.push('/projects/' + projectId);
}

const task = projectsStore.projects[projectIndex].tasks[taskIndex];

</script>

<template>
    <!-- TODO: Add header for queue statistics -->
    <NLayout
        content-style="padding: 24px;"
        :native-scrollbar="false"
    >
        <TaskDetail
            :project-id="task.projectId"
            :task-id="task.id"
        />
        <ConfigurationDefaults
            :project-id="task.projectId"
            :task-id="task.id"
        />
    </NLayout>
</template>
