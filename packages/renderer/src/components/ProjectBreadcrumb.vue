<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
    NBreadcrumb,
    NBreadcrumbItem,
} from 'naive-ui';
import { useProjectsStore } from '../stores/projects';
import {
    type Project,
    type Task,
} from '../../../main/src/data/Configuration/Projects';


const { projectId, taskId } = defineProps<{
    projectId: Project['id'];
    taskId?: Task['id'];
    taskPage?: 'status-history' | 'av1an-logs';
}>();

const projectsStore = useProjectsStore();
const { projects } = storeToRefs(projectsStore);

const projectIndex = projectsStore.projects.findIndex(p => p.id === projectId);
const taskIndex = projectIndex !== -1 ? projectsStore.projects[projectIndex].tasks.findIndex(t => t.id === taskId) : -1;

</script>

<template>
    <NBreadcrumb>
        <NBreadcrumbItem>
            <RouterLink
                :style="{ textDecoration: 'none' }"
                to="/"
            >
                Projects
            </RouterLink>
        </NBreadcrumbItem>
        <NBreadcrumbItem>
            <template
                v-if="taskIndex !== -1"
            >
                <RouterLink
                    :style="{ textDecoration: 'none' }"
                    :to="`/projects/${projectId}`"
                >
                    {{ projects[projectIndex].name ?? projects[projectIndex].id }}
                </RouterLink>
            </template>
            <template
                v-else
            >   
                {{ projects[projectIndex].name ?? projects[projectIndex].id }}
            </template>
        </NBreadcrumbItem>
        <NBreadcrumbItem
            v-if="taskIndex !== -1"
        >
            <template
                v-if="taskPage"
            >
                <RouterLink
                    :style="{ textDecoration: 'none' }"
                    :to="`/projects/${projectId}/tasks/${taskId}`"
                >
                    {{ projects[projectIndex].tasks[taskIndex].outputFileName ?? projects[projectIndex].tasks[taskIndex].id }}
                </RouterLink>
            </template>
            <template
                v-else
            >
                {{ projects[projectIndex].tasks[taskIndex].outputFileName ?? projects[projectIndex].tasks[taskIndex].id }}
            </template>
        </NBreadcrumbItem>
        <NBreadcrumbItem
            v-if="taskPage"
        >
            {{ taskPage === 'status-history' ? 'Progress History' : taskPage === 'av1an-logs' ? 'Av1an Logs' : '' }}
        </NBreadcrumbItem>
    </NBreadcrumb>
</template>

