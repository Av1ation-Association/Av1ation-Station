<script setup lang="ts">
import { storeToRefs } from 'pinia';
import {
    type MenuOption,
    NIcon,
    NMenu,
    NLayoutSider,
    NText,
    NSpace,
    NAnchor,
    NAnchorLink,
    NDivider,
} from 'naive-ui';
import {
    type Component,
    h,
} from 'vue';
import {
    RouterLink,
    // useRouter,
} from 'vue-router';
import {
    Home,
    VideoAdd,
    QueryQueue,
    SettingsAdjust,
} from '@vicons/carbon';
// import { useGlobalStore } from '../stores/global';
import { useSidebarMenuStore } from '../stores/sidebarMenu';

// const router = useRouter();

// const store = useGlobalStore();
const store = useSidebarMenuStore();

const { sidebarCollapsed, currentMenuValue } = storeToRefs(store);

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

const menuOptions: MenuOption[] = [
    {
        label: () => h(RouterLink, { to: '/' }, { default: () => generateLabel('Home') }),
        key: '',
        icon: renderIcon(Home),
    },
    // {
    //     label: () => h(RouterLink, { to: '/queue' }, { default: () => generateLabel('Queue') }),
    //     key: 'queue',
    //     icon: renderIcon(QueryQueue),
    // },
    // {
    //     label: () => h(RouterLink, { to: '/encode' }, { default: () => generateLabel('Encode') }),
    //     key: 'encode',
    //     icon: renderIcon(VideoAdd),
    // },
    {
        label: () => h(RouterLink, { to: '/settings' }, { default: () => generateLabel('Settings') }),
        key: 'settings',
        icon: renderIcon(SettingsAdjust),
    },
];
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
        <n-menu
            :collapsed="sidebarCollapsed"
            :value="$route.path.substring(1)"
            :options="menuOptions"
            :indent="10"
            default-expand-all
        />
        <NDivider />
        <NAnchor
            v-if="!sidebarCollapsed"
        >
            <NAnchorLink
                title="Demos"
                href="#Demos"
            >
                <NAnchorLink
                    title="Basic"
                    href="#basic.vue"
                />
                <NAnchorLink
                    title="Ignore-Gap"
                    href="#ignore-gap.vue"
                />
                <NAnchorLink
                    title="Affix"
                    href="#affix.vue"
                />
                <NAnchorLink
                    title="Scroll To"
                    href="#scrollto.vue"
                />
            </NAnchorLink>
            <NAnchorLink
                title="API"
                href="#API"
            />
        </NAnchor>
    </NLayoutSider>
</template>
