<script setup lang="ts">
import { h, ref, toRaw } from 'vue';
// import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
    NDropdown,
    type DropdownOption,
    NButton,
    NCard,
    NIcon,
    NInput,
    NTabs,
    NTabPane,
    NTooltip,
    NModal,
} from 'naive-ui';
import {
    OverflowMenuVertical,
    ResetAlt as ResetConfigIcon,
    Copy as CopyIcon,
    DataViewAlt as PreviewCommandIcon,
    SettingsView as AdvancedParametersIcon,
} from '@vicons/carbon';
import {
    Encoder,
} from '../../../../shared/src/data/Types/Options';
import { type Defaults } from '../../../../shared/src/data/Configuration';
import { ConfigurationType } from '../../../../shared/src/data/Configuration';
import { type Project, type Task } from '../../../../shared/src/data/Projects';
import { useGlobalStore } from '../../stores/global';
import { useProjectsStore } from '../../stores/projects';
import { useConfigurationsStore } from '../../stores/configurations';
import {
    getAv1anGeneralComponents,
    getAv1anScenesComponents,
    getAv1anChunkingComponents,
    getAv1anVMAFComponents,
    getAv1anTargetQualityComponents,
    getAv1anEncodingComponents,
    getAv1anCustomComponents,
    getAddAv1anCustomComponents,
    getAv1anEncodingCustomComponents,
    getAddAv1anEncodingCustomComponents,
    getSVTGeneralComponents,
    getSVTColorComponents,
    getSVTGlobalComponents,
    getSVTGOPComponents,
    getSVTRateControlComponents,
    getSVTAV1SpecificComponents,
} from '../Av1an/library';
import {
    getDependenciesComponents,
    getFileLocationsComponents,
} from '../Dependencies/library';
import DefaultsFormGrid from './DefaultsFormGrid.vue';
import DependenciesFormGrid from './DependenciesFormGrid.vue';

const configStore = useGlobalStore();
const projectsStore = useProjectsStore();
const { config } = storeToRefs(configStore);
const { projects } = storeToRefs(projectsStore);

const { projectId, taskId } = defineProps<{
    projectId?: Project['id'];
    taskId?: Task['id'];
}>();

const projectIndex = projectsStore.projects.findIndex(p => p.id === projectId);
const project = projectsStore.projects[projectIndex];
const taskIndex = projectIndex !== -1 ? projectsStore.projects[projectIndex].tasks.findIndex(t => t.id === taskId) : -1;
const task = taskIndex !== -1 ? projectsStore.projects[projectIndex].tasks[taskIndex] : undefined;

const configurationType = task ? ConfigurationType.Task : project ? ConfigurationType.Project : ConfigurationType.Config;
const configurationsStore = task
    ? useConfigurationsStore<ConfigurationType.Task>()
    : project
        ? useConfigurationsStore<ConfigurationType.Project>()
        : useConfigurationsStore<ConfigurationType.Config>();

// Initialize configurationsStore value
configurationsStore.initialize(configurationType, projectId, taskId);

const showAv1anCommandModal = ref(false);
const showAv1anPrintFriendlyCommand = ref(false);
let av1anCommand: Awaited<ReturnType<typeof window.projectsApi['build-task-av1an-arguments']>> = { arguments: [], printFriendlyArguments: [] };

// #region Dropdown

const dropdownOptions: DropdownOption[] = [
    {
        label: 'Preview Av1an Command',
        key: 'preview',
        icon: () => h(NIcon, null, { default: () => h(PreviewCommandIcon) }),
    },
    {
        label: 'Reset Configuration',
        key: 'reset',
        icon: () => h(NIcon, null, { default: () => h(ResetConfigIcon) }),
    },
    {
        label: `Show/Hide Advanced Parameters`,
        key: 'show-advanced',
        icon: () => h(NIcon, null, { default: () => h(AdvancedParametersIcon) }),
    },
];
async function handleDropdownSelect(key: string) {
    switch (key) {
        case 'preview': {
            if (task) {
                const simulatedTask: Task = {
                    ...task,
                    item: toRaw(configurationsStore.defaults as Defaults<ConfigurationType.Task>),
                };

                // Build Av1an Command
                const av1anOptions = projectsStore.buildTaskAv1anOptions(simulatedTask);
                if (!av1anOptions) {
                    return;
                }

                av1anCommand = await window.projectsApi['build-task-av1an-arguments'](av1anOptions);
            } else {
                const simulatedTaskAv1an = {
                    input: '{INPUT}',
                    output: '{OUTPUT}',
                    temporary: {
                        path: '{TEMPORARY}',
                        keep: true,
                        resume: true,
                    },
                } as unknown as Task['item']['Av1an'];

                // Build Av1an Command
                if (project) {
                    const { input: _configInput, output: _configOutput, temporary: _configTemporary, ...configDefaults } = structuredClone(toRaw(configStore.config.defaults.Av1an));
                    const { input: _projectInput, output: _projectOutput, temporary: _projectTemporary, ...projectDefaults } = structuredClone(toRaw(configurationsStore.defaults.Av1an));

                    const projectOptions = projectsStore.applyAv1anOptions({ ...simulatedTaskAv1an, ...configDefaults }, projectDefaults);
                    const customProjectOptions = projectsStore.mergeAv1anCustomOptions(structuredClone(toRaw(configStore.config.defaults.Av1anCustom)), structuredClone(toRaw(projectsStore.projects[projectIndex].defaults.Av1anCustom)));

                    av1anCommand = await window.projectsApi['build-task-av1an-arguments']({
                        Av1an: projectOptions,
                        Av1anCustom: customProjectOptions,
                    });
                } else {
                    const { input: _configInput, output: _configOutput, temporary: _configTemporary, ...configDefaults } = structuredClone(toRaw(configurationsStore.defaults.Av1an));

                    av1anCommand = await window.projectsApi['build-task-av1an-arguments']({
                        Av1an: {
                            ...simulatedTaskAv1an,
                            ...configDefaults,
                        },
                        Av1anCustom: structuredClone(toRaw(configStore.config.defaults.Av1anCustom)),
                    });
                }
            }
            showAv1anCommandModal.value = true;
            // Preview Av1an Command (Modal with textarea + copy to clipboard button?)
            break;
        }
        case 'reset': {
            // Reset form
            configurationsStore.initialize(configurationType, projectId, taskId, true);
            break;
        }
        case 'show-advanced':
            configStore.config.preferences.showAdvanced = !configStore.config.preferences.showAdvanced;
            await window.configurationsApi['save-config']();
            break;
        default:
            break;
    }
}

// #endregion Dropdown

async function copyToClipboard(text: string) {
    await window.configurationsApi['copy-to-clipboard'](text);
}

</script>

<template>
    <NCard
        :title="`Default Configurations`"
    >
        <template #header-extra>
            <NDropdown
                trigger="click"
                :options="dropdownOptions"
                @select="handleDropdownSelect"
            >
                <NButton
                    text
                    size="large"
                >
                    <template #icon>
                        <NIcon>
                            <OverflowMenuVertical />
                        </NIcon>
                    </template>
                </NButton>
            </NDropdown>
        </template>
        <NTabs
            animated
            type="card"
        >
            <NTabPane
                v-if="!task"
                name="file-locations"
                tab="File Locations"
            >
                <DependenciesFormGrid
                    :model-value="{
                        project: project ? projects[projectIndex] : undefined,
                    }"
                    :sections="[
                        { label: 'File Locations', formInputComponents: getFileLocationsComponents(project && projects[projectIndex]) },
                    ]"
                />
            </NTabPane>
            <NTabPane
                v-if="!task && (!project || config.preferences.showAdvanced)"
                name="dependencies"
                tab="Dependencies"
            >
                <DependenciesFormGrid
                    :model-value="{
                        project: project ? projects[projectIndex] : undefined,
                    }"
                    :sections="[
                        { label: 'Dependencies', formInputComponents: getDependenciesComponents(project && projects[projectIndex]) },
                    ]"
                />
            </NTabPane>
            <NTabPane
                name="av1an"
                tab="Av1an"
            >
                <DefaultsFormGrid
                    :model-value="{
                        project: project ? projects[projectIndex] : undefined,
                    }"
                    :sections="[
                        { label: 'General', formInputComponents: getAv1anGeneralComponents(task) },
                        { label: 'Scenes', formInputComponents: getAv1anScenesComponents(task) },
                        { label: 'Encoding', formInputComponents: getAv1anEncodingComponents() },
                        { label: 'Chunking', formInputComponents: getAv1anChunkingComponents() },
                        { label: 'VMAF', formInputComponents: getAv1anVMAFComponents() },
                        { label: 'Target Quality', formInputComponents: getAv1anTargetQualityComponents() },
                        { label: 'Custom Arguments', formInputComponents: getAv1anCustomComponents() },
                        { label: 'Add New Custom Argument', formInputComponents: getAddAv1anCustomComponents('--', ' ') },
                    ]"
                />
            </NTabPane>
            <NTabPane
                name="aom"
                tab="AOM"
                :disabled="(configurationsStore.defaults.Av1an.encoding?.encoder ?? configurationsStore.parentAv1an.encoding?.encoder ?? Encoder.aom) !== Encoder.aom"
            >
                <DefaultsFormGrid
                    :model-value="{
                        project: project ? projects[projectIndex] : undefined,
                    }"
                    :sections="[
                        { label: 'Custom AOM Arguments', formInputComponents: getAv1anEncodingCustomComponents() },
                        { label: 'Add New Custom AOM Argument', formInputComponents: getAddAv1anEncodingCustomComponents('--', '=') },
                    ]"
                />
            </NTabPane>
            <NTabPane
                name="svt"
                tab="SVT"
                :disabled="(configurationsStore.defaults.Av1an.encoding?.encoder ?? configurationsStore.parentAv1an.encoding?.encoder ?? Encoder.aom) !== Encoder.svt"
            >
                <DefaultsFormGrid
                    :model-value="{
                        project: project ? projects[projectIndex] : undefined,
                    }"
                    :sections="[
                        { label: 'General', formInputComponents: getSVTGeneralComponents() },
                        { label: 'Color', formInputComponents: getSVTColorComponents() },
                        { label: 'Global', formInputComponents: getSVTGlobalComponents() },
                        { label: 'Rate Control', formInputComponents: getSVTRateControlComponents() },
                        { label: 'GOP', formInputComponents: getSVTGOPComponents() },
                        { label: 'AV1 Specific', formInputComponents: getSVTAV1SpecificComponents() },
                        { label: 'Custom SVT Arguments', formInputComponents: getAv1anEncodingCustomComponents() },
                        { label: 'Add New Custom SVT Argument', formInputComponents: getAddAv1anEncodingCustomComponents('--', ' ') },
                    ]"
                />
            </NTabPane>
            <NTabPane
                name="rav1e"
                tab="rav1e"
                :disabled="(configurationsStore.defaults.Av1an.encoding?.encoder ?? configurationsStore.parentAv1an.encoding?.encoder ?? Encoder.aom) !== Encoder.rav1e"
            >
                <DefaultsFormGrid
                    :model-value="{
                        project: project ? projects[projectIndex] : undefined,
                    }"
                    :sections="[
                        { label: 'Custom rav1e Arguments', formInputComponents: getAv1anEncodingCustomComponents() },
                        { label: 'Add New Custom rav1e Argument', formInputComponents: getAddAv1anEncodingCustomComponents('--', ' ') },
                    ]"
                />
            </NTabPane>
            <NTabPane
                name="vpx"
                tab="VPX"
                :disabled="(configurationsStore.defaults.Av1an.encoding?.encoder ?? configurationsStore.parentAv1an.encoding?.encoder ?? Encoder.aom) !== Encoder.vpx"
            >
                <DefaultsFormGrid
                    :model-value="{
                        project: project ? projects[projectIndex] : undefined,
                    }"
                    :sections="[
                        { label: 'Custom vpx Arguments', formInputComponents: getAv1anEncodingCustomComponents() },
                        { label: 'Add New Custom vpx Argument', formInputComponents: getAddAv1anEncodingCustomComponents('--', '=') },
                    ]"
                />
            </NTabPane>
            <NTabPane
                name="x264"
                tab="x264"
                :disabled="(configurationsStore.defaults.Av1an.encoding?.encoder ?? configurationsStore.parentAv1an.encoding?.encoder ?? Encoder.aom) !== Encoder.x264"
            >
                <DefaultsFormGrid
                    :model-value="{
                        project: project ? projects[projectIndex] : undefined,
                    }"
                    :sections="[
                        { label: 'Custom x264 Arguments', formInputComponents: getAv1anEncodingCustomComponents() },
                        { label: 'Add New Custom x264 Argument', formInputComponents: getAddAv1anEncodingCustomComponents('--', ' ') },
                    ]"
                />
            </NTabPane>
            <NTabPane
                name="x265"
                tab="x265"
                :disabled="(configurationsStore.defaults.Av1an.encoding?.encoder ?? configurationsStore.parentAv1an.encoding?.encoder ?? Encoder.aom) !== Encoder.x265"
            >
                <DefaultsFormGrid
                    :model-value="{
                        project: project ? projects[projectIndex] : undefined,
                    }"
                    :sections="[
                        { label: 'Custom x265 Arguments', formInputComponents: getAv1anEncodingCustomComponents() },
                        { label: 'Add New Custom x265 Argument', formInputComponents: getAddAv1anEncodingCustomComponents('--', ' ') },
                    ]"
                />
            </NTabPane>
            <!-- </template> -->
        </NTabs>
    </NCard>
    <NModal
        v-model:show="showAv1anCommandModal"
        preset="card"
        title="Av1an Command"
        :style="{ width: '65%', height: '65%' }"
    >
        <template #header-extra>
            <NButton
                size="small"
                secondary
                @click="() => {
                    showAv1anPrintFriendlyCommand = !showAv1anPrintFriendlyCommand;
                }"
            >
                Show {{ showAv1anPrintFriendlyCommand ? 'Unquoted' : 'Console-Friendly' }} Command
            </NButton>
        </template>
        <NInput
            :value="`av1an ${(showAv1anPrintFriendlyCommand ? av1anCommand.printFriendlyArguments : av1anCommand.arguments).join(' ')}`"
            type="textarea"
            :autosize="{ minRows: 10, maxRows: 20 }"
            readonly
        >
            <template #suffix>
                <NButton
                    text
                    @click="copyToClipboard(`av1an ${(showAv1anPrintFriendlyCommand ? av1anCommand.printFriendlyArguments : av1anCommand.arguments).join(' ')}`)"
                >
                    <NTooltip
                        :delay="500"
                        :style="{ padding: '10px', paddingTop: '5px', paddingBottom: '5px' }"
                    >
                        <template #trigger>
                            <NIcon
                                :component="CopyIcon"
                            />
                        </template>
                        Copy
                    </NTooltip>
                </NButton>
            </template>
        </NInput>
    </NModal>
</template>
