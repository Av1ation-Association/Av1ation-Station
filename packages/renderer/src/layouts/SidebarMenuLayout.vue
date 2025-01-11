<script setup lang="ts">
import { storeToRefs } from 'pinia';
import {
    type MenuOption,
    NIcon,
    NMenu,
    NLayoutSider,
    NText,
    NFlex,
    NButtonGroup,
    NTooltip,
    NButton,
    NBadge,
    useNotification,
} from 'naive-ui';
import {
    type Component,
    h,
} from 'vue';
import { RouterLink } from 'vue-router';
import {
    Home,
    SettingsAdjust,
    Notification as NotificationIcon,
    WindowPreset,
    Sun,
    Moon,
    LogoGithub,
} from '@vicons/carbon';
import { useGlobalStore } from '../stores/global';
import { useSidebarStore } from '../stores/sidebar';
import {
    type Notification,
    NotificationTypeToTypeOverride,
    useNotificationsStore,
} from '../stores/notifications';
import { Theme } from '../../../shared/src/data/Configuration';

const store = useGlobalStore();
const sidebarStore = useSidebarStore();
const notificationsStore = useNotificationsStore();

const notifier = useNotification();

const { sidebarCollapsed } = storeToRefs(sidebarStore);

// Initialize Config
await store.getConfig();

// Initialize Notifications
if (notificationsStore.notificationListener === undefined) {
    notificationsStore.notificationListener = (notification: Notification) => {
        notifier.create({
            title: notification.title,
            type: NotificationTypeToTypeOverride(notification.title),
            duration: 5000,
            keepAliveOnHover: true,
            closable: true,
            onClose: () => {
                notificationsStore.clearNotification(notification.id);
            },
        });
    };
}

function generateLabel(label: string) {
    return h(
        NFlex,
        { justify: 'space-between' },
        {
            default: () => {
                const components = [
                    h(NText, null, { default: () => label }),
                ];

                return components;
            },
        },
    );
}

function renderIcon(icon: Component) {
    return () => h(NIcon, null, { default: () => h(icon) });
}

function generateMenuOptions(): MenuOption[] {
    return [
        {
            label: () => h(RouterLink, { to: '/' }, { default: () => generateLabel('Home') }),
            key: '/',
            icon: renderIcon(Home),
        },
        {
            label: () => h(RouterLink, { to: '/settings' }, { default: () => generateLabel('Settings') }),
            key: '/settings',
            icon: renderIcon(SettingsAdjust),
        },
    ];
}
</script>

<template>
    <NLayoutSider
        :width="120"
        :collapsed="sidebarCollapsed"
        collapse-mode="width"
        show-trigger="bar"
        bordered
        @update:collapsed="sidebarStore.toggleSidebar"
    >
        <NFlex
            vertical
            justify="space-between"
            style="height: 100%"
        >
            <NFlex>
                <NMenu
                    :collapsed="sidebarCollapsed"
                    :value="$route.path"
                    :options="generateMenuOptions()"
                    :indent="10"
                    default-expand-all
                />
            </NFlex>
            <NFlex
                vertical
                justify="end"
                style="padding: 8px;"
            >
                <NFlex
                    justify="center"
                >
                    <NButtonGroup
                        :vertical="sidebarCollapsed"
                    >
                        <NTooltip
                            :delay="500"
                            :style="{ padding: '5px', paddingTop: '2px', paddingBottom: '2px' }"
                            :placement="sidebarCollapsed ? 'right' : undefined"
                        >
                            <template #trigger>
                                <NButton
                                    size="small"
                                    circle
                                    tertiary
                                    @click="() => {
                                        $router.push('/notifications');
                                    }"
                                >
                                    <template #icon>
                                        <NBadge
                                            :value="notificationsStore.notifications.length"
                                            type="info"
                                        >
                                            <NIcon>
                                                <NotificationIcon />
                                            </NIcon>
                                        </NBadge>
                                    </template>
                                </NButton>
                            </template>
                            View Notifications
                        </NTooltip>
                        <NTooltip
                            :delay="500"
                            :style="{ padding: '5px', paddingTop: '2px', paddingBottom: '2px' }"
                            :placement="sidebarCollapsed ? 'right' : undefined"
                        >
                            <template #trigger>
                                <NButton
                                    size="small"
                                    circle
                                    tertiary
                                    @click="() => {
                                        store.updateTheme(store.config.appearance.theme === 'light' ? Theme.Dark : store.config.appearance.theme === 'dark' ? Theme.Auto : Theme.Light);
                                    }"
                                >
                                    <template #icon>
                                        <NIcon>
                                            <WindowPreset v-if="store.config.appearance.theme === Theme.Auto" />
                                            <Sun v-else-if="store.config.appearance.theme === Theme.Light" />
                                            <Moon v-else />
                                        </NIcon>
                                    </template>
                                </NButton>
                            </template>
                            Toggle Theme
                        </NTooltip>
                        <NTooltip
                            :delay="500"
                            :style="{ padding: '5px', paddingTop: '2px', paddingBottom: '2px' }"
                            :placement="sidebarCollapsed ? 'right' : undefined"
                        >
                            <template #trigger>
                                <NButton
                                    size="small"
                                    circle
                                    tertiary
                                    tag="a"
                                    href="https://github.com/Av1ation-Association/Av1ation-Creations"
                                    target="_blank"
                                >
                                    <template #icon>
                                        <NIcon>
                                            <LogoGithub />
                                        </NIcon>
                                    </template>
                                </NButton>
                            </template>
                            View Repository
                        </NTooltip>
                    </NButtonGroup>
                </NFlex>
            </NFlex>
        </NFlex>
    </NLayoutSider>
</template>
