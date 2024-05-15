<script setup lang="ts">
import { onBeforeRouteUpdate, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
    NFlex,
    NLayout,
    NCard,
    NLog,
    NButton,
    NIcon,
    NTooltip,
} from 'naive-ui';
import { VolumeFileStorage as RevealIcon } from '@vicons/carbon';
import { useProjectsStore } from '../stores/projects';
import ProjectBreadcrumb from '../components/ProjectBreadcrumb.vue';
import { onBeforeMount, toRaw } from 'vue';

const router = useRouter();

const projectsStore = useProjectsStore();
const { projects, taskLogMap } = storeToRefs(projectsStore);

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

onBeforeMount(async () => {
    // TODO: Ensure log.log exists
    const pId = projectsStore.projects[projectIndex].id;
    const tId = projectsStore.projects[projectIndex].tasks[taskIndex].id;
    if (!projectsStore.taskLogMap[pId] || !projectsStore.taskLogMap[pId][tId]) {
        // Initialize task log
        if (!projectsStore.taskLogMap[pId]) {
            projectsStore.taskLogMap[pId] = {};
        }
        projectsStore.taskLogMap[pId][tId] = await window.projectsApi['task-get-av1an-temporary-log-file'](toRaw(projectsStore.projects[projectIndex].tasks[taskIndex]));
    }
});

async function revealLogFile() {
    const logFileLocation = await window.configurationsApi['resolve-path'](projectsStore.projects[projectIndex].tasks[taskIndex].item.Av1an.temporary.path, './log.log');
    console.log('logFileLocation', logFileLocation);
    await window.configurationsApi['show-file'](logFileLocation);
}

</script>

<template>
    <!-- TODO: Add header for queue statistics -->
    <NLayout
        content-style="padding: 24px;"
        :native-scrollbar="false"
    >
        <NFlex
            vertical
        >
            <ProjectBreadcrumb
                :project-id="projects[projectIndex].id"
                :task-id="projects[projectIndex].tasks[taskIndex].id"
                :task-page="'av1an-logs'"
            />
            <NCard
                title="Task Av1an Logs"
            >
                <template #header-extra>
                    <NTooltip
                        :delay="500"
                        placement="left"
                        :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                    >
                        <template #trigger>
                            <NButton
                                size="small"
                                secondary
                                @click="revealLogFile"
                            >
                                <template #icon>
                                    <NIcon>
                                        <RevealIcon />
                                    </NIcon>
                                </template>
                            </NButton>
                        </template>
                        Open File Location
                    </NTooltip>
                </template>
                <NLog
                    :log="taskLogMap[projects[projectIndex].id][projects[projectIndex].tasks[taskIndex].id]"
                    :rows="30"
                />
            </NCard>
        </NFlex>
    </NLayout>
</template>
