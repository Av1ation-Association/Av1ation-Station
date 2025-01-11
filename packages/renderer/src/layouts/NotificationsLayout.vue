<script setup lang="ts">
import {
    NCard,
    NLayout,
    NIcon,
    NButton,
    NTooltip,
} from 'naive-ui';
import { Delete as TrashIcon } from '@vicons/carbon';
import NotificationCenter from '../components/NotificationCenter.vue';

import { useNotificationsStore } from '../stores/notifications';

const notificationsStore = useNotificationsStore();

</script>

<template>
    <NLayout
        content-style="padding: 24px;"
        :native-scrollbar="false"
    >
        <NCard
            title="Notifications"
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
                            @click="() => notificationsStore.clearAllNotifications()"
                        >
                            <template #icon>
                                <NIcon>
                                    <TrashIcon />
                                </NIcon>
                            </template>
                        </NButton>
                    </template>
                    Clear All
                </NTooltip>
            </template>
            <NotificationCenter
                :notifications="notificationsStore.notifications"
            />
        </NCard>
    </NLayout>
</template>
