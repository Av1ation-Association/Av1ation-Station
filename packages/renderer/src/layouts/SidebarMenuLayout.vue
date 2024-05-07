<script setup lang="ts">
import { storeToRefs } from 'pinia';
import {
    type MenuOption,
    NIcon,
    NMenu,
    NLayoutSider,
    NText,
    NSpace,
} from 'naive-ui';
import {
    type Component,
    h,
} from 'vue';
import { RouterLink } from 'vue-router';
import {
    Home,
    SettingsAdjust,
} from '@vicons/carbon';
import { useSidebarMenuStore } from '../stores/sidebarMenu';

const store = useSidebarMenuStore();

const { sidebarCollapsed } = storeToRefs(store);

function generateLabel(label: string) {
    return h(
        NSpace,
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
        :native-scrollbar="false"
        :collapsed="sidebarCollapsed"
        collapse-mode="width"
        show-trigger="bar"
        bordered
        @update:collapsed="store.toggleSidebar"
    >
        <NMenu
            :collapsed="sidebarCollapsed"
            :value="$route.path"
            :options="generateMenuOptions()"
            :indent="10"
            default-expand-all
        />
    </NLayoutSider>
</template>
