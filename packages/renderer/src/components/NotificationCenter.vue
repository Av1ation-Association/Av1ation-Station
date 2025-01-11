<script setup lang="ts">
import {
    onBeforeUnmount,
    onMounted,
    ref,
} from 'vue';
import { RouterLink } from 'vue-router';
import {
    NAlert,
    NDescriptions,
    NDescriptionsItem,
    NFlex,
    NText,
    NTooltip,
} from 'naive-ui';
import {
    type Notification,
    NotificationTypeToTypeOverride,
    useNotificationsStore,
} from '../stores/notifications';
import { useProjectsStore } from '../stores/projects';

const { notifications } = defineProps<{
    notifications: Notification[],
}>();

const notificationsStore = useNotificationsStore();
const projectsStore = useProjectsStore();

// #region Column Width
const columnWidths = [600, 1200, 1800, 2400, 3000, 3600, 4200, 4800];
let columnCount = ref<number>(Math.trunc(window.innerWidth / 600) + 1);

function handleResize() {
    columnCount.value = Math.trunc(window.innerWidth / 600) + 1;
}


onMounted(() => {
    columnWidths.forEach(width => {
        window.matchMedia(`(min-width: ${width}px)`).addEventListener('change', handleResize);
    });
});

onBeforeUnmount(() => {
    columnWidths.forEach(width => {
        window.matchMedia(`(min-width: ${width}px)`).removeEventListener('change', handleResize);
    });
});

</script>

<template>
    <NFlex
        vertical
    >
        <template
            v-for="notification in notifications"
            :key="notification.id"
        >
            <NAlert
                :type="NotificationTypeToTypeOverride(notification.title)"
                :show-icon="false"
                :title="notification.title"
                closable
                :on-close="() => notificationsStore.clearNotification(notification.id)"
            >
                <NDescriptions
                    v-if="notification.projectId || notification.taskId"
                    bordered
                    :column="columnCount"
                    size="small"
                >
                    <NDescriptionsItem
                        v-if="notification.projectId"
                        label="Project"
                    >
                        <RouterLink
                            v-if="projectsStore.projects.findIndex(project => project.id === notification.projectId) !== -1"
                            :style="{ textDecoration: 'none' }"
                            :to="`/projects/${notification.projectId}`"
                        >
                            <NTooltip
                                :delay="500"
                                placement="top-start"
                                :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                            >
                                <template #trigger>
                                    <NText>{{ projectsStore.projects.find(project => project.id === notification.projectId)?.name ?? notification.projectId }}</NText>
                                </template>
                                {{ notification.projectId }}
                            </NTooltip>
                        </RouterLink>
                        <template v-else>
                            <NTooltip
                                :delay="500"
                                placement="top-start"
                                :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                            >
                                <template #trigger>
                                    Deleted
                                </template>
                                {{ notification.projectId }}
                            </NTooltip>
                        </template>
                    </NDescriptionsItem>
                    <NDescriptionsItem
                        v-if="notification.taskId"
                        label="Task"
                    >
                        <RouterLink
                            v-if="projectsStore.projects.findIndex(project => project.id === notification.projectId) !== -1 && projectsStore.projects.find(project => project.id === notification.projectId)?.tasks.findIndex(task => task.id === notification.taskId) !== -1"
                            :style="{ textDecoration: 'none' }"
                            :to="`/projects/${notification.projectId}/tasks/${notification.taskId}`"
                        >
                            <NTooltip
                                :delay="500"
                                placement="top-start"
                                :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                            >
                                <template #trigger>
                                    <NText>{{ projectsStore.projects.find(project => project.id === notification.projectId)?.tasks.find(task => task.id === notification.taskId)?.outputFileName }}</NText>
                                </template>
                                {{ notification.taskId }}
                            </NTooltip>
                        </RouterLink>
                        <template v-else>
                            <NTooltip
                                :delay="500"
                                placement="top-start"
                                :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                            >
                                <template #trigger>
                                    Deleted
                                </template>
                                {{ notification.taskId }}
                            </NTooltip>
                        </template>
                    </NDescriptionsItem>
                </NDescriptions>
            </NAlert>
        </template>
    </NFlex>
</template>
