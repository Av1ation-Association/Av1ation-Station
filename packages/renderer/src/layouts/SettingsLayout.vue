<script setup lang="ts">
import {
    ref,
    h,
    toRaw,
} from 'vue';
import { storeToRefs } from 'pinia';
import {
    NLayout,
    NCard,
    NFlex,
    NFormItem,
    NSelect,
    NButton,
    NModal,
    NIcon,
    useMessage,
    NSwitch,
    NUl,
    NLi,
    NH3,
} from 'naive-ui';
import {
    ResetAlt as ResetIcon,
    Fire as FireIcon,
} from '@vicons/carbon';
import { useGlobalStore } from '../stores/global';
import ConfigurationDefaults from '../components/Configuration/ConfigurationDefaults.vue';
import ConfigurationFloatingButtons from '../components/Configuration/ConfigurationFloatingButtons.vue';
import {
    Theme,
    VSHIPBackend,
} from '../../../shared/src/data/Configuration';
import { useProjectsStore } from '../stores/projects';

const configStore = useGlobalStore();
const projectsStore = useProjectsStore();
const { config } = storeToRefs(configStore);

const message = useMessage();

const showEmergencyRescueModal = ref(false);
const showRestartModal = ref(false);

// TODO: Stop all ongoing tasks before resetting or restarting
async function resetAv1ationStation() {
    configStore.resetConfig();
    // Delete projects folder
    await window.projectsApi['delete-projects-folder']();

    // Reinitialize
    await configStore.initialize();
    await projectsStore.initialize();

    message.info('Av1ation Station has been reset. All projects and tasks have been deleted. Av1an temporary files were not deleted from disk.');
}

async function restartAv1ationStation() {
    await window.configurationsApi['restart-app']();
}

</script>

<template>
    <NLayout
        content-style="padding: 24px;"
        :native-scrollbar="false"
    >
        <NFlex
            vertical
        >
            <NCard
                title="Settings"
            >
                <NFormItem
                    label="Theme"
                >
                    <NSelect
                        v-model:value="config.appearance.theme"
                        :options="[
                            { label: 'System (Auto)', value: Theme.Auto },
                            { label: 'Light', value: Theme.Light },
                            { label: 'Dark', value: Theme.Dark },
                        ]"
                        @update:value="async (value: Theme) => {
                            configStore.updateTheme(value);
                            await configStore.setConfig(toRaw(configStore.config), true);
                        }"
                    >
                    </NSelect>
                </NFormItem>
                <NFormItem
                    label="Hardware Acceleration (UI only)"
                >
                    <NSwitch
                        v-model:value="config.appearance.enableHardwareAcceleration"
                        @update:value="async (_value: boolean) => {
                            await configStore.setConfig(toRaw(configStore.config), true);

                            showRestartModal = true;
                        }"
                    >
                    </NSwitch>
                </NFormItem>
                <NH3>VapourSynth</NH3>
                <NFormItem
                    label="Target Quality Vapoursynth-HIP Hardware Acceleration Backend"
                >
                    <NSelect
                        v-model:value="config.preferences.vship"
                        :options="[
                            { label: 'Disabled', value: VSHIPBackend.Disabled },
                            { label: 'NVIDIA', value: VSHIPBackend.NVIDIA },
                            { label: 'AMD', value: VSHIPBackend.AMD },
                        ]"
                        @update:value="async (value: VSHIPBackend) => {
                            await configStore.updateVshipBackend(value);
                            await configStore.setConfig(toRaw(configStore.config), true);
                        }"
                    >
                    </NSelect>
                </NFormItem>
                <NH3>Notifications</NH3>
                <NFormItem
                    label="Application"
                >
                    <NSwitch
                        v-model:value="config.preferences.notifications.app"
                        @update:value="async (_value: boolean) => {
                            await configStore.setConfig(toRaw(configStore.config), true);
                        }"
                    >
                    </NSwitch>
                </NFormItem>
                <NFormItem
                    label="Operating System"
                >
                    <NSwitch
                        v-model:value="config.preferences.notifications.os"
                        @update:value="async (_value: boolean) => {
                            await configStore.setConfig(toRaw(configStore.config), true);
                        }"
                    >
                    </NSwitch>
                </NFormItem>
            </NCard>
            <ConfigurationDefaults />
            <NCard
                title="Emergency Rescue"
            >
                Reset Av1ation Station to Factory Settings
                <NUl>
                    <NLi>
                        Everything will be reset to their default values
                    </NLi>
                    <NLi>
                        All projects and tasks will be deleted
                    </NLi>
                    <NLi>
                        Input, Output, and Av1an temporary files will not be deleted
                    </NLi>
                </NUl>
                <template #footer>
                    <NFlex
                        justify="end"
                    >
                        <NFormItem>
                            <NButton
                                type="error"
                                @click="() => {
                                    showEmergencyRescueModal = true;
                                }"
                            >
                                <template #icon>
                                    <NIcon>
                                        <FireIcon />
                                    </NIcon>
                                </template>
                                Reset Av1ation Station
                            </NButton>
                        </NFormItem>
                    </NFlex>
                </template>
            </NCard>
        </NFlex>
        <NModal
            v-model:show="showEmergencyRescueModal"
            preset="dialog"
            title="Reset Av1ation Station to Factory Settings"
            :style="{ width: '65%', height: '65%' }"
            type="error"
            content="Are you sure you want to reset Av1ation Station to factory settings? This cannot be undone."
            positive-text="Reset"
            negative-text="Cancel"
            :positive-button-props="{
                renderIcon: () => h(NIcon, null, { default: () => h(ResetIcon) }),
                type: 'error',
            }"
            @positive-click="resetAv1ationStation"
        />
        <NModal
            v-model:show="showRestartModal"
            preset="dialog"
            title="Restart Av1ation Station"
            :style="{ width: '65%', height: '65%' }"
            type="info"
            content="Changes to the Hardware Acceleration setting will not take effect until Av1ation Station is restarted. Restart now?"
            positive-text="Restart"
            negative-text="Not now"
            :positive-button-props="{
                renderIcon: () => h(NIcon, null, { default: () => h(ResetIcon) }),
                type: 'info',
            }"
            @positive-click="restartAv1ationStation"
        />
    </NLayout>
    <ConfigurationFloatingButtons />
</template>
