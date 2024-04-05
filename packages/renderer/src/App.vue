<script lang="ts" setup>
import { NLayout } from 'naive-ui';
import { onBeforeMount } from 'vue';
import NaiveProvider from './components/NaiveProvider.vue';
import SidebarMenu from './layouts/SidebarMenuLayout.vue';
import { useGlobalStore } from './stores/global';
// import { storeToRefs } from 'pinia';

onBeforeMount(async () => {

    const store = useGlobalStore();

    // Initialize Config
    await store.getConfig();
});

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
        </naiveprovider>
    </suspense>
</template>

<style>
</style>
