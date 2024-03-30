<script setup lang="ts">
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
    NLayout,
    NLayoutHeader,
    NLayoutContent,
    NBreadcrumb,
    NBreadcrumbItem,
    NDropdown,
} from 'naive-ui';

const router = useRouter();

</script>

<template>
    {{ $route }}
    IN SETTINGS LAYOUT
</template>
