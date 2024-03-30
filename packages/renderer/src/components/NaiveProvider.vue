<script lang="ts" setup>
import {
    useOsTheme,
    lightTheme,
    darkTheme,
    NConfigProvider,
    NGlobalStyle,
    NLoadingBarProvider,
    NMessageProvider,
    NDialogProvider,
} from 'naive-ui';
import { storeToRefs } from 'pinia';
import { useGlobalStore } from '../stores/global';
import { Theme } from '../../../main/src/data/Configuration/Types/Configuration';

// Temporary global store - to be refined later
const store = useGlobalStore();

// Get configuration and set theme
const { appearance } = await window.configurationsApi['get-config']();

switch (appearance.theme) {
    case Theme.Auto: store.theme = useOsTheme().value === 'dark' ? darkTheme : lightTheme;
        break;
    case Theme.Light: store.theme = lightTheme;
        break;
    case Theme.Dark: store.theme = darkTheme;
        break;
}

const { theme } = storeToRefs(store);

</script>

<template>
    <n-config-provider :theme="theme">
        <n-global-style />
        <n-loading-bar-provider>
            <n-message-provider>
                <n-dialog-provider>
                    <slot />
                </n-dialog-provider>
            </n-message-provider>
        </n-loading-bar-provider>
    </n-config-provider>
</template>
