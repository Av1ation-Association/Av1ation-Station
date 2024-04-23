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
} from 'naive-ui';
import {
    VolumeFileStorage as RevealIcon,
    OverflowMenuVertical,
    // Reset as ResetIcon,
    Delete as RemoveIcon,
    ErrorOutline as DisableIcon,
} from '@vicons/carbon';
import {
    Av1anInputLocationType,
    Av1anOutputLocationType,
    Av1anTemporaryLocationType,
    type Av1anConfiguration,
} from '../../../../main/src/data/Configuration/Av1anConfiguration';
import { type Project } from '../../../../main/src/data/Configuration/Projects';
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
// const { projects } = storeToRefs(projectsStore);

const { projectId } = defineProps<{
    projectId?: Project['id'];
}>();

const projectIndex = projectsStore.projects.findIndex(p => p.id === projectId);
const project = projectsStore.projects[projectIndex];

const dropdownOptions: DropdownOption[] = [
    {
        label: 'Preview Av1an Command',
        key: 'preview',
        icon: () => h(NIcon, null, { default: () => h(RevealIcon) }),
    },
    {
        label: 'Revert Changes',
        key: 'revert',
        icon: () => h(NIcon, null, { default: () => h(RevealIcon) }),
    },
    {
        label: 'Reset Configuration',
        key: 'reset',
        icon: () => h(NIcon, null, { default: () => h(RevealIcon) }),
    },
    {
        label: 'Reset Favorites',
        key: 'reset-favorites',
        icon: () => h(NIcon, null, { default: () => h(RevealIcon) }),
    },
    {
        label: 'Show Hidden',
        key: 'show-hidden',
        icon: () => h(NIcon, null, { default: () => h(RevealIcon) }),
    },
];
async function handleDropdownSelect(key: string) {
    switch (key) {
        case 'preview':
            // Preview Av1an Command (Modal with textarea + copy to clipboard button?)
            break;
        case 'revert':
            // Clear defaultsFormValue
            break;
        case 'reset':
            // Clear defaultsFormValue and delete config/project defaults
            break;
        case 'reset-favorites':
            // Clear preferences.defaults
            break;
        case 'show-hidden':
            break;
        default:
            break;
    }
}

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
const wrappedRef = { defaultsFormValue };

const customAv1anParameters = ref<typeof config.value.defaults.Av1anCustom>({
    ...toRaw(project ?? configStore.config).defaults.Av1anCustom,
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

    if (result && result.warnings?.length) {
        // TODO: Validation and alert notifications
        console.log(result);
    }

    (project ?? configStore.config).defaults.Av1an = toRaw(defaultsFormValue.value) as Av1anConfiguration;
    (project ?? configStore.config).defaults.Av1anCustom = toRaw(customAv1anParameters.value);
    if (project) {
        // Save Project File
        await projectsStore.saveProject(project);
    } else {
        await window.configurationsApi['save-config']();
    }
}

</script>

<template>
    <NCard
        :title="`Default Configurations`"
    >
        <template #header-extra>
            <NButton
                @click="saveDefaultsConfig"
            >
                Save
            </NButton>
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
            ref="defaultsForm"
            :model="defaultsFormValue"
            :rules="defaultsFormRules"
        >
            <NTabs
                animated
                type="card"
            >
                <NTabPane
                    name="file-locations"
                    tab="File Locations"
                >
                    <NGrid
                        :span="24"
                        :x-gap="24"
                    >
                        <NFormItemGridItem
                            label="Input Location"
                            path="input.type"
                            :span="12"
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
                            :span="12"
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
                            :span="12"
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
                            :span="12"
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
                            :span="12"
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
                            :span="12"
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
                    name="av1an-general"
                    tab="Av1an General"
                >
                    <DefaultsFormGrid
                        :model-value="{
                            defaultsFormValue,
                            project,
                        }"
                        :form-input-components="getAv1anGeneralComponents(wrappedRef.defaultsFormValue)"
                    />
                </NTabPane>
                <NTabPane
                    name="scenes"
                    tab="Scenes"
                >
                    <DefaultsFormGrid
                        :model-value="{
                            defaultsFormValue,
                            project,
                        }"
                        :form-input-components="getAv1anScenesComponents(wrappedRef.defaultsFormValue)"
                    />
                </NTabPane>
                <NTabPane
                    name="chunking"
                    tab="Chunking"
                >
                    <DefaultsFormGrid
                        :model-value="{
                            defaultsFormValue,
                            project,
                        }"
                        :form-input-components="getAv1anChunkingComponents(wrappedRef.defaultsFormValue)"
                    />
                </NTabPane>
                <NTabPane
                    name="vmaf"
                    tab="VMAF"
                >
                    <DefaultsFormGrid
                        :model-value="{
                            defaultsFormValue,
                            project,
                        }"
                        :form-input-components="getAv1anVMAFComponents(wrappedRef.defaultsFormValue)"
                    />
                </NTabPane>
                <NTabPane
                    name="target-quality"
                    tab="Target Quality"
                >
                    <DefaultsFormGrid
                        :model-value="{
                            defaultsFormValue,
                            project,
                        }"
                        :form-input-components="getAv1anTargetQualityComponents(wrappedRef.defaultsFormValue)"
                    />
                </NTabPane>
                <NTabPane
                    name="encoding"
                    tab="Encoding"
                >
                    <DefaultsFormGrid
                        :model-value="{
                            defaultsFormValue,
                            project,
                        }"
                        :form-input-components="getAv1anEncodingComponents(wrappedRef.defaultsFormValue)"
                    />
                    <NGrid
                        :span="24"
                        :x-gap="12"
                    >
                        <NFormItemGridItem
                            :label="`Add Custom Encoder Parameter`"
                            :path="`addCustomEncoding`"
                            :span="24"
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
                                :span="12"
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
                                                // Set to undefined and when saved it will remove the key from the object
                                                (customAv1anParameters.encoding![parameterName] as string | undefined) = undefined;
                                            }"
                                        >
                                            <NTooltip>
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
                                                (customAv1anParameters.encoding![parameterName] as string | null) = null;
                                            }"
                                        >
                                            <NTooltip>
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
                                    :v-model:value="customAv1anParameters.encoding![parameterName]"
                                    clearable
                                    :disabled="parameterValue === null"
                                    :placeholder="parameterValue === null ? 'Disabled' : parameterValue"
                                    :on-update:value="(value) => {
                                        customAv1anParameters.encoding![parameterName] = value ?? '';
                                    }"
                                />
                                <NInputNumber
                                    v-else-if="typeof parameterValue === 'number'"
                                    :v-model:value="(customAv1anParameters.encoding![parameterName] as number)"
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
                    v-if="defaultsFormValue.encoding?.encoder === 'svt-av1'"
                >
                    <NTabPane
                        name="svt-general"
                        tab="SVT General"
                    >
                        <DefaultsFormGrid
                            :model-value="{
                                defaultsFormValue,
                                project,
                            }"
                            :form-input-components="getSVTGeneralComponents(wrappedRef.defaultsFormValue)"
                        />
                    </NTabPane>
                    <NTabPane
                        name="svt-global"
                        tab="SVT Global"
                    >
                        <DefaultsFormGrid
                            :model-value="{
                                defaultsFormValue,
                                project,
                            }"
                            :form-input-components="getSVTGlobalComponents(wrappedRef.defaultsFormValue)"
                        />
                    </NTabPane>
                    <NTabPane
                        name="svt-rate-control"
                        tab="SVT Rate Control"
                    >
                        <DefaultsFormGrid
                            :model-value="{
                                defaultsFormValue,
                                project,
                            }"
                            :form-input-components="getSVTRateControlComponents(wrappedRef.defaultsFormValue)"
                        />
                    </NTabPane>
                    <NTabPane
                        name="svt-gop"
                        tab="SVT GOP"
                    >
                        <DefaultsFormGrid
                            :model-value="{
                                defaultsFormValue,
                                project,
                            }"
                            :form-input-components="getSVTGOPComponents(wrappedRef.defaultsFormValue)"
                        />
                    </NTabPane>
                    <NTabPane
                        name="svt-av1-specific"
                        tab="SVT AV1 Specific"
                    >
                        <DefaultsFormGrid
                            :model-value="{
                                defaultsFormValue,
                                project,
                            }"
                            :form-input-components="getSVTAV1SpecificComponents(wrappedRef.defaultsFormValue)"
                        />
                    </NTabPane>
                </template>
            </NTabs>
        </NForm>
    </NCard>
</template>../Av1an/SVT/SVTGeneral.vue