<script lang="ts" setup>
import {
    NConfigProvider,
    NGlobalStyle,
    NLoadingBarProvider,
    NMessageProvider,
    NDialogProvider,
    NModalProvider,
    NNotificationProvider,
} from 'naive-ui';
import { storeToRefs } from 'pinia';
import { useGlobalStore } from '../stores/global';

const configStore = useGlobalStore();

const { theme } = storeToRefs(configStore);

</script>

<template>
    <NConfigProvider :theme="theme">
        <NGlobalStyle />
        <NLoadingBarProvider>
            <NMessageProvider>
                <NDialogProvider>
                    <NModalProvider>
                        <NNotificationProvider>
                            <slot />
                        </NNotificationProvider>
                    </NModalProvider>
                </NDialogProvider>
            </NMessageProvider>
        </NLoadingBarProvider>
    </NConfigProvider>
</template>
