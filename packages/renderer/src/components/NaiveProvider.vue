<script lang="ts" setup>
import {
    NConfigProvider,
    NGlobalStyle,
    NLoadingBarProvider,
    NMessageProvider,
    NDialogProvider,
    NModalProvider,
} from 'naive-ui';
import { storeToRefs } from 'pinia';
import { useGlobalStore } from '../stores/global';

const configStore = useGlobalStore();

const { theme } = storeToRefs(configStore);

</script>

<template>
    <n-config-provider :theme="theme">
        <n-global-style />
        <n-loading-bar-provider>
            <n-message-provider>
                <n-dialog-provider>
                    <n-modal-provider>
                        <slot />
                    </n-modal-provider>
                </n-dialog-provider>
            </n-message-provider>
        </n-loading-bar-provider>
    </n-config-provider>
</template>
