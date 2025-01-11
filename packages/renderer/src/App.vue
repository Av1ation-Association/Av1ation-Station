<script lang="ts" setup>
import { NLayout } from 'naive-ui';
import { onBeforeMount } from 'vue';
import { useRouter } from 'vue-router';
import NaiveProvider from './components/NaiveProvider.vue';
import SidebarMenu from './layouts/SidebarMenuLayout.vue';
import { useGlobalStore } from './stores/global';
import { useProjectsStore } from './stores/projects';

onBeforeMount(async () => {

    const store = useGlobalStore();
    const projectsStore = useProjectsStore();

    // Initialize Config
    await store.getConfig();
    await store.initialize();

    // Initialize Projects
    await projectsStore.initialize();
});

const router = useRouter();
router.push('/');

</script>

<template>
    <title>Av1ation Station</title>
    <suspense>
        <NaiveProvider>
            <NLayout
                position="absolute"
                has-sider
            >
                <SidebarMenu />
                <RouterView />
            </NLayout>
        </NaiveProvider>
    </suspense>
</template>

<style>
</style>
