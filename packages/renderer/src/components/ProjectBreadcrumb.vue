<script setup lang="ts">
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
    NBreadcrumb,
    NBreadcrumbItem,
    NButton,
} from 'naive-ui';
import { useProjectsStore } from '../stores/projects';
import {
    type Project,
    type Task,
} from '../../../main/src/data/Configuration/Projects';


const { projectId, taskId } = defineProps<{
    projectId: Project['id'];
    taskId?: Task['id'];
}>();

const router = useRouter();
const projectsStore = useProjectsStore();
const { projects } = storeToRefs(projectsStore);

const projectIndex = projectsStore.projects.findIndex(p => p.id === projectId);
const taskIndex = projectIndex !== -1 ? projectsStore.projects[projectIndex].tasks.findIndex(t => t.id === taskId) : -1;

</script>

<template>
    <NBreadcrumb>
        <NBreadcrumbItem>
            <NButton
                text
                @click="() => {
                    router.push(`/projects/${projectId}`)
                }"
            >
                {{ projects[projectIndex].name ?? projects[projectIndex].id }}
            </NButton>
        </NBreadcrumbItem>
        <NBreadcrumbItem
            v-if="taskIndex !== -1"
        >
            {{ projects[projectIndex].tasks[taskIndex].outputFileName ?? projects[projectIndex].tasks[taskIndex].id }}
        </NBreadcrumbItem>
    </NBreadcrumb>
</template>

