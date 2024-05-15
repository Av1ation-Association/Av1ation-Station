<script setup lang="ts">
import { h, ref, toRaw } from 'vue';
// import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
    NDropdown,
    type DropdownOption,
    NButton,
    NCard,
    NGrid,
    NIcon,
    NForm,
    type FormInst,
    type FormRules,
    NFormItemGridItem,
    NSelect,
    NInputGroup,
    NInput,
    NTabs,
    NTabPane,
    NInputNumber,
    NButtonGroup,
    NTooltip,
    NH3,
    NH4,
    NModal,
} from 'naive-ui';
import {
    OverflowMenuVertical,
    Delete as RemoveIcon,
    SaveAnnotation as ApplyChangesIcon,
    ErrorOutline as DisableIcon,
    Edit as EditIcon,
    Reset as ResetIcon,
    ResetAlt as ResetConfigIcon,
    Copy as CopyIcon,
    DataViewAlt as PreviewCommandIcon,
    SettingsView as AdvancedParametersIcon,
} from '@vicons/carbon';
import {
    Av1anInputLocationType,
    Av1anOutputLocationType,
    Av1anTemporaryLocationType,
    type Av1anConfiguration,
} from '../../../../main/src/data/Configuration/Av1anConfiguration';
import { type Project, type Task } from '../../../../main/src/data/Configuration/Projects';
import { useGlobalStore } from '../../stores/global';
import { useProjectsStore } from '../../stores/projects';
import {
    getAv1anGeneralComponents,
    getAv1anScenesComponents,
    getAv1anChunkingComponents,
    getAv1anVMAFComponents,
    getAv1anTargetQualityComponents,
    getAv1anEncodingComponents,
    getSVTGeneralComponents,
    getSVTGlobalComponents,
    getSVTGOPComponents,
    getSVTRateControlComponents,
    getSVTAV1SpecificComponents,
} from '../Av1an/library';
import DefaultsFormGrid from './DefaultsFormGrid.vue';

// const router = useRouter();

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

const showAv1anCommandModal = ref(false);
const showAv1anPrintFriendlyCommand = ref(false);
let av1anCommand: Awaited<ReturnType<typeof window.projectsApi['build-task-av1an-arguments']>> = { arguments: [], printFriendlyArguments: [] };
const formGridColumnSize = '1 400:2 800:3 1200:4 1600:5 2400:6 3000:7 3600:8';

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
                    item: {
                        Av1an: toRaw(av1anFormValue.value) as Task['item']['Av1an'],
                        Av1anCustom: toRaw(customAv1anParameters.value),
                    },
                };

                // Build Av1an Command
                const av1anOptions = projectsStore.buildTaskAv1anOptions(simulatedTask);
                if (!av1anOptions) {
                    return;
                }

                av1anCommand = await window.projectsApi['build-task-av1an-arguments'](av1anOptions);
            } else {
                const simulatedTaskOptions = {
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
                    const { input: _configInput, output: _configOutput, temporary: _configTemporary, ...configDefaults } = toRaw(configStore.config.defaults.Av1an);
                    const { input: _projectInput, output: _projectOutput, temporary: _projectTemporary, ...projectDefaults } = toRaw(defaultsFormValue.value);
                    const configOptions = projectsStore.applyAv1anOptions(simulatedTaskOptions, configDefaults);
                    const customConfigOptions = projectsStore.applyAv1anOptions(configOptions, toRaw(configStore.config.defaults.Av1anCustom));
                    const projectOptions = projectsStore.applyAv1anOptions(customConfigOptions, projectDefaults);
                    const customProjectOptions = projectsStore.applyAv1anOptions(projectOptions, toRaw(customAv1anParameters.value));
                    av1anCommand = await window.projectsApi['build-task-av1an-arguments'](customProjectOptions);
                } else {
                    const { input: _configInput, output: _configOutput, temporary: _configTemporary, ...configDefaults } = toRaw(defaultsFormValue.value);
                    const configOptions = projectsStore.applyAv1anOptions(simulatedTaskOptions, configDefaults);
                    const customConfigOptions = projectsStore.applyAv1anOptions(configOptions, toRaw(customAv1anParameters.value));

                    av1anCommand = await window.projectsApi['build-task-av1an-arguments'](customConfigOptions);
                }
            }
            showAv1anCommandModal.value = true;
            // Preview Av1an Command (Modal with textarea + copy to clipboard button?)
            break;
        }
        case 'reset': {
            // Reset form
            if (task) {
                av1anFormValue.value = {
                    input: task.item.Av1an.input,
                    output: task.item.Av1an.output,
                    temporary: task.item.Av1an.temporary,
                    scenes: {
                        path: task.item.Av1an.scenes?.path,
                    },
                };
            } else {
                defaultsFormValue.value = {
                    input: {
                        type: Av1anInputLocationType.Videos,
                    },
                    output: {
                        type: Av1anOutputLocationType.InputAdjacent,
                    },
                    temporary: {
                        type: Av1anTemporaryLocationType.InputAdjacentAv1anFolder,
                    },
                };
            }
            customAv1anParameters.value = {};

            // Save defaults
            await saveDefaultsConfig();
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

const defaultsForm = ref<FormInst>();
const defaultsFormRules = ref<FormRules>({
    input: {
        type: {
            type: 'string',
            required: false,
        },
    },
    output: {
        type: {
            type: 'string',
            required: false,
        },
    },
    temporary: {
        type: {
            type: 'string',
            required: false,
        },
    },
});
const av1anForm = ref<FormInst>();
const av1anFormRules = ref<FormRules>({});

export type PartialChildren<T> = { [K in keyof T]?: Partial<T[K]>; };
export type PartialAv1anConfiguration = PartialChildren<Av1anConfiguration> & { input: Partial<Av1anConfiguration['input']>; output: Partial<Av1anConfiguration['output']>; temporary: Partial<Av1anConfiguration['temporary']> };
const defaultsFormValue = ref<PartialAv1anConfiguration>({
    ...(toRaw(project ?? configStore.config)).defaults.Av1an,
    input: {
        type: (project ?? configStore.config).defaults.Av1an.input.type,
        ...((project ?? configStore.config).defaults.Av1an.input.customFolder && { customFolder: (project ?? configStore.config).defaults.Av1an.input.customFolder }),
    },
    output: {
        type: (project ?? configStore.config).defaults.Av1an.output.type,
        extension: (project ?? configStore.config).defaults.Av1an.output.extension,
        ...((project ?? configStore.config).defaults.Av1an.output.customFolder && { customFolder: (project ?? configStore.config).defaults.Av1an.output.customFolder }),
    },
    temporary: {
        type: (project ?? configStore.config).defaults.Av1an.temporary.type,
        ...((project ?? configStore.config).defaults.Av1an.temporary.customFolder && { customFolder: (project ?? configStore.config).defaults.Av1an.temporary.customFolder }),
    },
});
const av1anFormValue = ref<PartialChildren<Task['item']['Av1an']>>({
    ...(toRaw(task)?.item.Av1an),
});
const wrappedRef = { defaultsFormValue, av1anFormValue };
const parentAv1anValue = task ? { ...toRaw(configStore.config.defaults.Av1an), ...toRaw(project.defaults.Av1an) } : configStore.config.defaults.Av1an;

const customParentAv1anParameters = ref<typeof config.value.defaults.Av1anCustom>({
    ...(project ? toRaw(configStore.config.defaults.Av1anCustom) : {}),
    ...(task ? toRaw(project.defaults.Av1anCustom) : {}),
});
const customAv1anParameters = ref<typeof config.value.defaults.Av1anCustom>({
    ...(task ? toRaw(task).item.Av1anCustom : toRaw(project ?? configStore.config).defaults.Av1anCustom),
});
const customEncoderParameterName = ref('');
const customEncoderParameterType = ref<'string' | 'number'>('string');

async function selectInputFolder() {
    const inputFolderPath = await window.configurationsApi['open-file'](undefined, 'Select Default Input Folder', undefined, ['openDirectory']);

    if (inputFolderPath.length) {
        defaultsFormValue.value.input.customFolder = inputFolderPath[0];
    }
}

async function selectOutputFolder() {
    const outputFolderPath = await window.configurationsApi['open-file'](defaultsFormValue.value.output.customFolder ?? project.defaults.Av1an.output.customFolder ?? configStore.config.defaults.Av1an.output.customFolder, 'Select Default Output Folder', undefined, ['openDirectory']);

    if (outputFolderPath.length) {
        defaultsFormValue.value.output.customFolder = outputFolderPath[0];
    }
}

async function selectTemporaryFolder() {
    const temporaryFolderPath = await window.configurationsApi['open-file'](defaultsFormValue.value.temporary.customFolder ?? project.defaults.Av1an.temporary.customFolder ?? configStore.config.defaults.Av1an.temporary.customFolder, 'Select Default Temporary Folder', undefined, ['openDirectory']);

    if (temporaryFolderPath.length) {
        defaultsFormValue.value.temporary.customFolder = temporaryFolderPath[0];
    }
}

async function saveDefaultsConfig() {
    const result = await defaultsForm.value?.validate();
    const av1anResult = await av1anForm.value?.validate();

    // TODO: Validation and alert notifications
    if (result && result.warnings?.length) {
        console.log(result);
    }
    if (av1anResult && av1anResult.warnings?.length) {
        console.log(av1anResult);
    }

    if (task) {
        projectsStore.projects[projectIndex].tasks[taskIndex].item.Av1an = toRaw(av1anFormValue.value) as Task['item']['Av1an'];
        projectsStore.projects[projectIndex].tasks[taskIndex].item.Av1anCustom = toRaw(customAv1anParameters.value);

        // Save Project File
        await projectsStore.saveProject(toRaw(projectsStore.projects[projectIndex]), false);
    } else {
        (project ? projectsStore.projects[projectIndex] : configStore.config).defaults.Av1an = toRaw(defaultsFormValue.value) as Av1anConfiguration;
        (project ? projectsStore.projects[projectIndex] : configStore.config).defaults.Av1anCustom = toRaw(customAv1anParameters.value);

        if (project) {
            // Save Project File
            await projectsStore.saveProject(toRaw(projectsStore.projects[projectIndex]));
        } else {
            await window.configurationsApi['save-config']();
        }
    }
}

async function copyToClipboard(text: string) {
    await window.configurationsApi['copy-to-clipboard'](text);
}

</script>

<template>
    <NCard
        :title="`Default Configurations`"
    >
        <template #header-extra>
            <NTooltip
                :delay="500"
                placement="left"
                :style="{ padding: '10px', paddingTop: '5px', paddingBottom: '5px' }"
            >
                <template #trigger>
                    <NButton
                        @click="saveDefaultsConfig"
                    >
                        <template #icon>
                            <NIcon>
                                <ApplyChangesIcon />
                            </NIcon>
                        </template>
                    </NButton>
                </template>
                Apply Changes
            </NTooltip>
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
        <NForm
            :ref="task ? 'av1anForm' : 'defaultsForm'"
            :model="task ? av1anFormValue : defaultsFormValue"
            :rules="task ? av1anFormRules : defaultsFormRules"
        >
            <NTabs
                animated
                type="card"
            >
                <NTabPane
                    v-if="!task"
                    name="file-locations"
                    tab="File Locations"
                >
                    <NGrid
                        :cols="formGridColumnSize"
                        x-gap="12"
                    >
                        <NFormItemGridItem
                            label="Input Location"
                            path="input.type"
                        >
                            <NSelect
                                v-model:value="defaultsFormValue.input.type"
                                clearable
                                :options="[
                                    { label: 'Videos', value: Av1anInputLocationType.Videos },
                                    { label: 'Desktop', value: Av1anInputLocationType.Desktop },
                                    { label: 'Downloads', value: Av1anInputLocationType.Downloads },
                                    { label: 'Custom', value: Av1anInputLocationType.Custom },
                                ]"
                                :placeholder="config?.defaults.Av1an.input.type === Av1anInputLocationType.Videos ? 'Videos' : config?.defaults.Av1an.input.type === Av1anInputLocationType.Desktop ? 'Desktop' : config?.defaults.Av1an.input.type === Av1anInputLocationType.Downloads ? 'Downloads' : 'Custom'"
                                @update:value="(value: string) => {
                                    if (value === Av1anInputLocationType.Custom) {
                                        (defaultsFormRules.input as any).customFolder = {
                                            type: 'string',
                                            required: true,
                                        };
                                    } else {
                                        if (defaultsFormValue.input.customFolder) {
                                            delete (defaultsFormRules.input as any).customFolder;
                                            delete defaultsFormValue.input.customFolder;
                                        }
                                    }
                                }"
                            />
                        </NFormItemGridItem>
                        <NFormItemGridItem
                            v-if="defaultsFormValue.input.type === Av1anInputLocationType.Custom"
                            label="Custom Input Folder Location"
                            path="input.customFolder"
                        >
                            <NInputGroup>
                                <NInput
                                    v-model:value="defaultsFormValue.input.customFolder"
                                    clearable
                                />
                                <NButton
                                    type="primary"
                                    @click="selectInputFolder"
                                >
                                    Select
                                </NButton>
                            </NInputGroup>
                        </NFormItemGridItem>
                        <NFormItemGridItem
                            label="Output Location"
                            path="output.type"
                        >
                            <NSelect
                                v-model:value="defaultsFormValue.output.type"
                                clearable
                                :options="[
                                    { label: 'Input Adjacent', value: Av1anOutputLocationType.InputAdjacent },
                                    { label: 'Input Adjacent Av1an Folder', value: Av1anOutputLocationType.InputAdjacentAv1anFolder },
                                    { label: 'Videos', value: Av1anOutputLocationType.Videos },
                                    { label: 'Desktop', value: Av1anOutputLocationType.Desktop },
                                    { label: 'Downloads', value: Av1anOutputLocationType.Downloads },
                                    { label: 'Custom', value: Av1anOutputLocationType.Custom },
                                ]"
                                :placeholder="config?.defaults.Av1an.output.type === Av1anOutputLocationType.InputAdjacent ? 'Input Adjacent' : config?.defaults.Av1an.output.type === Av1anOutputLocationType.InputAdjacentAv1anFolder ? 'Input Adjacent Av1an Folder' : config?.defaults.Av1an.output.type === Av1anOutputLocationType.Videos ? 'Videos' : config?.defaults.Av1an.output.type === Av1anOutputLocationType.Desktop ? 'Desktop' : config?.defaults.Av1an.output.type === Av1anOutputLocationType.Downloads ? 'Downloads' : 'Custom'"
                                @update:value="(value: string) => {
                                    if (value === Av1anOutputLocationType.Custom) {
                                        (defaultsFormRules.output as any).customFolder = {
                                            type: 'string',
                                            required: true,
                                        };
                                    } else {
                                        if (defaultsFormValue.output.customFolder) {
                                            delete (defaultsFormRules.output as any).customFolder;
                                            delete defaultsFormValue.output.customFolder;
                                        }
                                    }
                                }"
                            />
                        </NFormItemGridItem>
                        <NFormItemGridItem
                            v-if="defaultsFormValue.output.type === Av1anOutputLocationType.Custom"
                            label="Custom Output Folder Location"
                            path="output.customFolder"
                        >
                            <NInputGroup>
                                <NInput
                                    v-model:value="defaultsFormValue.output.customFolder"
                                    clearable
                                />
                                <NButton
                                    type="primary"
                                    @click="selectOutputFolder"
                                >
                                    Select
                                </NButton>
                            </NInputGroup>
                        </NFormItemGridItem>
                        <NFormItemGridItem
                            label="Temporary Folder Location"
                            path="temporary.type"
                        >
                            <NSelect
                                v-model:value="defaultsFormValue.temporary.type"
                                clearable
                                :options="[
                                    { label: 'Input Adjacent', value: Av1anTemporaryLocationType.InputAdjacentAv1anFolder },
                                    { label: 'Av1ation Station Documents Folder', value: Av1anTemporaryLocationType.Av1ationStationDocumentsFolder },
                                    { label: 'Custom', value: Av1anTemporaryLocationType.Custom },
                                ]"
                                :placeholder="config?.defaults.Av1an.temporary.type === Av1anTemporaryLocationType.InputAdjacentAv1anFolder ? 'Input Adjacent' : config?.defaults.Av1an.temporary.type === Av1anTemporaryLocationType.Av1ationStationDocumentsFolder ? 'Av1ation Station Documents Folder' : 'Custom'"
                                @update:value="(value: string) => {
                                    if (value === Av1anTemporaryLocationType.Custom) {
                                        (defaultsFormRules.temporary as any).customFolder = {
                                            type: 'string',
                                            required: true,
                                        };
                                    } else {
                                        if (defaultsFormValue.temporary.customFolder) {
                                            delete (defaultsFormRules.temporary as any).customFolder;
                                            delete defaultsFormValue.temporary.customFolder;
                                        }
                                    }
                                }"
                            />
                        </NFormItemGridItem>
                        <NFormItemGridItem
                            v-if="defaultsFormValue.temporary.type === Av1anTemporaryLocationType.Custom"
                            label="Custom Temporary Folder Location"
                            path="temporary.customFolder"
                        >
                            <NInputGroup>
                                <NInput
                                    v-model:value="defaultsFormValue.temporary.customFolder"
                                    clearable
                                />
                                <NButton
                                    type="primary"
                                    @click="selectTemporaryFolder"
                                >
                                    Select
                                </NButton>
                            </NInputGroup>
                        </NFormItemGridItem>
                    </NGrid>
                </NTabPane>
                <NTabPane
                    name="av1an"
                    tab="Av1an"
                >
                    <DefaultsFormGrid
                        :model-value="{
                            defaultsFormValue: task ? av1anFormValue : defaultsFormValue,
                            project: project ? projects[projectIndex] : undefined,
                        }"
                        :sections="[
                            { label: 'General', formInputComponents: getAv1anGeneralComponents(task ? wrappedRef.av1anFormValue : wrappedRef.defaultsFormValue, parentAv1anValue) },
                            { label: 'Scenes', formInputComponents: getAv1anScenesComponents(task ? wrappedRef.av1anFormValue : wrappedRef.defaultsFormValue, parentAv1anValue, toRaw(task)) },
                            { label: 'Chunking', formInputComponents: getAv1anChunkingComponents(task ? wrappedRef.av1anFormValue : wrappedRef.defaultsFormValue, parentAv1anValue) },
                            { label: 'VMAF', formInputComponents: getAv1anVMAFComponents(task ? wrappedRef.av1anFormValue : wrappedRef.defaultsFormValue, parentAv1anValue) },
                            { label: 'Target Quality', formInputComponents: getAv1anTargetQualityComponents(task ? wrappedRef.av1anFormValue : wrappedRef.defaultsFormValue, parentAv1anValue) },
                            { label: 'Encoding', formInputComponents: getAv1anEncodingComponents(task ? wrappedRef.av1anFormValue : wrappedRef.defaultsFormValue, parentAv1anValue) },
                        ]"
                    />
                    <NH3>Custom Encoder Parameters</NH3>
                    <template
                        v-if="(task || project) && customParentAv1anParameters.encoding && Object.entries(customParentAv1anParameters.encoding).length > 0"
                    >
                        <NH4>{{ `Inherited from ${task ? 'Global and Project' : 'Global'}` }}</NH4>
                        <NGrid
                            :cols="formGridColumnSize"
                            x-gap="12"
                        >
                            <template
                                v-for="[parameterName, parameterValue] in Object.entries(customParentAv1anParameters.encoding)"
                                :key="`parent.encoding.${parameterName}`"
                            >
                                <NFormItemGridItem
                                    :label="parameterName"
                                    :path="`encoding.${parameterName}`"
                                >
                                    <template #label>
                                        {{ parameterName }}
                                        <!-- Sacrificial Button workaround for button inheriting sibling/parent label when using "text" option and causing double click -->
                                        <NButton text />
                                        <NButtonGroup>
                                            <NButton
                                                v-if="!customAv1anParameters.encoding || !(parameterName in customAv1anParameters.encoding)"
                                                text
                                                size="small"
                                                @click="() => {
                                                    // Set to undefined and when saved it will remove the key from the object
                                                    if (!customAv1anParameters.encoding) {
                                                        customAv1anParameters.encoding = {};
                                                    }

                                                    customAv1anParameters.encoding[parameterName] = parameterValue;
                                                }"
                                            >
                                                <NTooltip
                                                    :delay="500"
                                                    :style="{ padding: '5px', paddingTop: '2px', paddingBottom: '2px' }"
                                                >
                                                    <template #trigger>
                                                        <NIcon
                                                            :component="EditIcon"
                                                        />
                                                    </template>
                                                    Edit
                                                </NTooltip>
                                            </NButton>
                                            <NButton
                                                v-if="!customAv1anParameters.encoding || (customAv1anParameters.encoding[parameterName]) !== null"
                                                text
                                                size="small"
                                                @click="() => {
                                                    // Set to null to override parent (config object) value
                                                    if (!customAv1anParameters.encoding) {
                                                        customAv1anParameters.encoding = {};
                                                    }
                                                    customAv1anParameters.encoding[parameterName] = null;
                                                }"
                                            >
                                                <NTooltip
                                                    :delay="500"
                                                    :style="{ padding: '5px', paddingTop: '2px', paddingBottom: '2px' }"
                                                >
                                                    <template #trigger>
                                                        <NIcon
                                                            :component="DisableIcon"
                                                        />
                                                    </template>
                                                    Disable
                                                </NTooltip>
                                            </NButton>
                                        </NButtonGroup>
                                    </template>
                                    <NInput
                                        v-if="typeof parameterValue === 'string' || parameterValue === null"
                                        :v-model:value="parameterValue"
                                        readonly
                                        :placeholder="parameterValue === null ? 'Disabled' : parameterValue"
                                    />
                                    <NInputNumber
                                        v-else-if="typeof parameterValue === 'number'"
                                        :v-model:value="parameterValue"
                                        readonly
                                        :placeholder="parameterValue === null ? 'Disabled' : `${parameterValue}`"
                                    />
                                </NFormItemGridItem>
                            </template>
                        </NGrid>
                    </template>

                    <NGrid
                        :cols="formGridColumnSize"
                        x-gap="12"
                    >
                        <NFormItemGridItem
                            :label="`Add Custom Encoder Parameter`"
                            :path="`addCustomEncoding`"
                            :span="2"
                        >
                            <NInputGroup>
                                <NInput
                                    v-model:value="customEncoderParameterName"
                                    clearable
                                    placeholder="Parameter Name"
                                />
                                <NSelect
                                    v-model:value="customEncoderParameterType"
                                    :options="[
                                        { label: 'String', value: 'string' },
                                        { label: 'Number', value: 'number' },
                                    ]"
                                    :style="{ width: '25%' }"
                                />
                                <NButton
                                    @click="() => {
                                        if (!customAv1anParameters.encoding) {
                                            customAv1anParameters.encoding = {};
                                        }
                                        customAv1anParameters.encoding[customEncoderParameterName] = customEncoderParameterType === 'string' ? '' : 0;
                                        // Clear name
                                        customEncoderParameterName = '';
                                    }"
                                >
                                    Add
                                </NButton>
                            </NInputGroup>
                        </NFormItemGridItem>
                        <template
                            v-for="[parameterName, parameterValue] in Object.entries(customAv1anParameters.encoding ?? {})"
                            :key="`encoding.${parameterName}`"
                        >
                            <NFormItemGridItem
                                v-if="parameterValue !== undefined"
                                :label="parameterName"
                                :path="`encoding.${parameterName}`"
                            >
                                <template #label>
                                    {{ parameterName }}
                                    <!-- Sacrificial Button workaround for button inheriting sibling/parent label when using "text" option and causing double click -->
                                    <NButton text />
                                    <NButtonGroup>
                                        <NButton
                                            text
                                            size="small"
                                            @click="() => {
                                                if (!customAv1anParameters.encoding) {
                                                    customAv1anParameters.encoding = {};
                                                }

                                                customAv1anParameters.encoding[parameterName] = typeof customAv1anParameters.encoding![parameterName] === 'string' ? '' : 0;
                                            }"
                                        >
                                            <NTooltip
                                                :delay="500"
                                                :style="{ padding: '5px', paddingTop: '2px', paddingBottom: '2px' }"
                                            >
                                                <template #trigger>
                                                    <NIcon
                                                        :component="ResetIcon"
                                                    />
                                                </template>
                                                Reset
                                            </NTooltip>
                                        </NButton>
                                        <NButton
                                            v-if="customAv1anParameters.encoding && parameterName in customAv1anParameters.encoding"
                                            text
                                            size="small"
                                            @click="() => {
                                                // Set to undefined and when saved it will remove the key from the object
                                                (customAv1anParameters.encoding![parameterName] as string | undefined) = undefined;
                                            }"
                                        >
                                            <NTooltip
                                                :delay="500"
                                                :style="{ padding: '5px', paddingTop: '2px', paddingBottom: '2px' }"
                                            >
                                                <template #trigger>
                                                    <NIcon
                                                        :component="RemoveIcon"
                                                    />
                                                </template>
                                                Remove
                                            </NTooltip>
                                        </NButton>
                                        <NButton
                                            text
                                            size="small"
                                            @click="() => {
                                                // Set to null to override parent (config object) value
                                                if (!customAv1anParameters.encoding) {
                                                    customAv1anParameters.encoding = {};
                                                }
                                                (customAv1anParameters.encoding![parameterName] as string | null) = null;
                                            }"
                                        >
                                            <NTooltip
                                                :delay="500"
                                                :style="{ padding: '5px', paddingTop: '2px', paddingBottom: '2px' }"
                                            >
                                                <template #trigger>
                                                    <NIcon
                                                        :component="DisableIcon"
                                                    />
                                                </template>
                                                Disable
                                            </NTooltip>
                                        </NButton>
                                    </NButtonGroup>
                                </template>
                                <NInput
                                    v-if="typeof parameterValue === 'string' || parameterValue === null"
                                    :v-model:value="customAv1anParameters.encoding && parameterName in customAv1anParameters.encoding ? customAv1anParameters.encoding![parameterName] : customParentAv1anParameters.encoding![parameterName]"
                                    clearable
                                    :disabled="parameterValue === null"
                                    :placeholder="parameterValue === null ? 'Disabled' : parameterValue"
                                    :on-update:value="(value) => {
                                        customAv1anParameters.encoding![parameterName] = value ?? '';
                                    }"
                                />
                                <NInputNumber
                                    v-else-if="typeof parameterValue === 'number'"
                                    :v-model:value="(customAv1anParameters.encoding && parameterName in customAv1anParameters.encoding ? customAv1anParameters.encoding[parameterName] as number : customParentAv1anParameters.encoding![parameterName] as number)"
                                    clearable
                                    :disabled="parameterValue === null"
                                    :placeholder="parameterValue === null ? 'Disabled' : `${parameterValue}`"
                                    :on-update:value="(value) => {
                                        customAv1anParameters.encoding![parameterName] = value ?? 0;
                                    }"
                                />
                            </NFormItemGridItem>
                        </template>
                    </NGrid>
                </NTabPane>
                <template
                    v-if="({ ...parentAv1anValue.encoding, ...defaultsFormValue.encoding } as typeof defaultsFormValue.encoding).encoder && ({ ...parentAv1anValue.encoding, ...defaultsFormValue.encoding } as typeof defaultsFormValue.encoding).encoder === 'svt-av1'"
                >
                    <NTabPane
                        name="svt"
                        tab="SVT"
                    >
                        <DefaultsFormGrid
                            :model-value="{
                                defaultsFormValue: task ? av1anFormValue : defaultsFormValue,
                                project: project ? projects[projectIndex] : undefined,
                            }"
                            :sections="[
                                { label: 'General', formInputComponents: getSVTGeneralComponents(task ? wrappedRef.av1anFormValue : wrappedRef.defaultsFormValue, parentAv1anValue) },
                                { label: 'Global', formInputComponents: getSVTGlobalComponents(task ? wrappedRef.av1anFormValue : wrappedRef.defaultsFormValue, parentAv1anValue) },
                                { label: 'Rate Control', formInputComponents: getSVTRateControlComponents(task ? wrappedRef.av1anFormValue : wrappedRef.defaultsFormValue, parentAv1anValue) },
                                { label: 'GOP', formInputComponents: getSVTGOPComponents(task ? wrappedRef.av1anFormValue : wrappedRef.defaultsFormValue, parentAv1anValue) },
                                { label: 'AV1 Specific', formInputComponents: getSVTAV1SpecificComponents(task ? wrappedRef.av1anFormValue : wrappedRef.defaultsFormValue, parentAv1anValue) },
                            ]"
                        />
                    </NTabPane>
                </template>
            </NTabs>
        </NForm>
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
            :autosize="{ minRows: 2, maxRows: 4 }"
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