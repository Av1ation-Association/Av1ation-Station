<script setup lang="ts">
import { type RouteLocationNormalized } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
    NButton,
    NTabs,
    NTabPane,
    NModal,
    NFlex,
    NIcon,
} from 'naive-ui';
import {
    Delete as RemoveIcon,
    SaveAnnotation as ApplyChangesIcon,
} from '@vicons/carbon';
import { type ConfigurationType } from '../../../../shared/src/data/Configuration';
import { type Project, type Task } from '../../../../shared/src/data/Projects';
import { useGlobalStore } from '../../stores/global';
import { useProjectsStore } from '../../stores/projects';
import { useConfigurationsStore } from '../../stores/configurations';
import DefaultsFormGrid from './DefaultsFormGrid.vue';
import DependenciesFormGrid from './DependenciesFormGrid.vue';
import {
    getDependenciesComponents,
    getFileLocationsComponents,
} from '../Dependencies/library';
import {
    getAv1anChunkingComponents,
    getAv1anEncodingComponents,
    getAv1anGeneralComponents,
    getAv1anScenesComponents,
    getAv1anTargetQualityComponents,
    getAv1anVMAFComponents,
    getAv1anCustomComponents,
    getAv1anEncodingCustomComponents,
    getSVTGeneralComponents,
    getSVTGlobalComponents,
    getSVTGOPComponents,
    getSVTRateControlComponents,
    getSVTAV1SpecificComponents,
} from '../Av1an/library';

const configStore = useGlobalStore();
const projectsStore = useProjectsStore();
const { config } = storeToRefs(configStore);
const { projects } = storeToRefs(projectsStore);

const { projectId, taskId } = defineProps<{
    projectId?: Project['id'];
    taskId?: Task['id'];
}>();

const model = defineModel<{
    to?: RouteLocationNormalized,
}>();

const projectIndex = projectsStore.projects.findIndex(p => p.id === projectId);

const configurationsStore = taskId
    ? useConfigurationsStore<ConfigurationType.Task>()
    : projectId
        ? useConfigurationsStore<ConfigurationType.Project>()
        : useConfigurationsStore<ConfigurationType.Config>();
</script>

<template>
    <NModal
        v-model:show="configurationsStore.showUnsavedChangedModal"
        preset="card"
        :style="{ width: '65%', height: '65%' }"
        :on-close="() => {
            if (model?.to) {
                // Reset to to undefined
                model.to = undefined;
            }
        }"
        :on-mask-click="() => {
            if (model?.to) {
                // Reset to to undefined
                model.to = undefined;
            }
        }"
    >
        <template #header>
            Review Unsaved Configuration Changes
        </template>
        <NTabs
            animated
            type="card"
        >
            <NTabPane
                v-if="!taskId && (configurationsStore.modifiedComponents.fileLocationComponents.length)"
                name="file-locations"
                tab="File Locations"
            >
                <DependenciesFormGrid
                    :model-value="{
                        project: projectId ? projects[projectIndex] : undefined,
                    }"
                    :sections="[
                        { label: 'File Locations', formInputComponents: getFileLocationsComponents(projectId ? projects[projectIndex] : undefined).filter(component => configurationsStore.modifiedComponents.fileLocationComponents.map(component => component.path).includes(component.path)) },
                    ]"
                />
            </NTabPane>
            <NTabPane
                v-if="!taskId && (!projectId || config.preferences.showAdvanced) && (configurationsStore.modifiedComponents.dependencyComponents.length)"
                name="dependencies"
                tab="Dependencies"
            >
                <DependenciesFormGrid
                    :model-value="{
                        project: projectId ? projects[projectIndex] : undefined,
                    }"
                    :sections="[
                        { label: 'Dependencies', formInputComponents: getDependenciesComponents(projectId ? projects[projectIndex] : undefined).filter(component => configurationsStore.modifiedComponents.dependencyComponents.map(component => component.path).includes(component.path)) },
                    ]"
                />
            </NTabPane>
            <NTabPane
                v-if="configurationsStore.modifiedComponents.av1anGeneralComponents.length
                    || configurationsStore.modifiedComponents.av1anScenesComponents.length
                    || configurationsStore.modifiedComponents.av1anChunkingComponents.length
                    || configurationsStore.modifiedComponents.av1anVMAFComponents.length
                    || configurationsStore.modifiedComponents.av1anTargetQualityComponents.length
                    || configurationsStore.modifiedComponents.av1anEncodingComponents.length
                    || configurationsStore.modifiedComponents.av1anCustomComponents.length
                    || configurationsStore.modifiedComponents.av1anEncodingCustomComponents.length"
                name="av1an"
                tab="Av1an"
            >
                <DefaultsFormGrid
                    :model-value="{
                        project: projectId ? projects[projectIndex] : undefined,
                    }"
                    :sections="[
                        ...(configurationsStore.modifiedComponents.av1anGeneralComponents.length ? [{ label: 'General', formInputComponents: getAv1anGeneralComponents().filter(component => component.isModified()) }] : []),
                        ...(configurationsStore.modifiedComponents.av1anScenesComponents.length ? [{ label: 'Scenes', formInputComponents: getAv1anScenesComponents().filter(component => component.isModified()) }] : []),
                        ...(configurationsStore.modifiedComponents.av1anChunkingComponents.length ? [{ label: 'Chunking', formInputComponents: getAv1anChunkingComponents().filter(component => component.isModified()) }] : []),
                        ...(configurationsStore.modifiedComponents.av1anVMAFComponents.length ? [{ label: 'VMAF', formInputComponents: getAv1anVMAFComponents().filter(component => component.isModified()) }] : []),
                        ...(configurationsStore.modifiedComponents.av1anTargetQualityComponents.length ? [{ label: 'Target Quality', formInputComponents: getAv1anTargetQualityComponents().filter(component => component.isModified()) }] : []),
                        ...(configurationsStore.modifiedComponents.av1anEncodingComponents.length ? [{ label: 'Encoding', formInputComponents: getAv1anEncodingComponents().filter(component => component.isModified()) }] : []),
                        ...(configurationsStore.modifiedComponents.av1anCustomComponents.length ? [{ label: 'Custom Arguments', formInputComponents: getAv1anCustomComponents().filter(component => component.isModified()) }] : []),
                        ...(configurationsStore.modifiedComponents.av1anEncodingCustomComponents.length ? [{ label: 'Custom Arguments', formInputComponents: getAv1anEncodingCustomComponents().filter(component => component.isModified()) }] : []),
                    ]"
                />
            </NTabPane>
            <template
                v-if="configurationsStore.modifiedComponents.svtGeneralComponents.length
                    || configurationsStore.modifiedComponents.svtGlobalComponents.length
                    || configurationsStore.modifiedComponents.svtGOPComponents.length
                    || configurationsStore.modifiedComponents.svtAV1SpecificComponents.length
                    || configurationsStore.modifiedComponents.svtRateControlComponents.length"
            >
                <NTabPane
                    name="svt"
                    tab="SVT"
                >
                    <DefaultsFormGrid
                        :model-value="{
                            project: projectId ? projects[projectIndex] : undefined,
                        }"
                        :sections="[
                            ...(configurationsStore.modifiedComponents.svtGeneralComponents.length ? [{ label: 'General', formInputComponents: getSVTGeneralComponents().filter(component => component.isModified()) }] : []),
                            ...(configurationsStore.modifiedComponents.svtGlobalComponents.length ? [{ label: 'Global', formInputComponents: getSVTGlobalComponents().filter(component => component.isModified()) }] : []),
                            ...(configurationsStore.modifiedComponents.svtRateControlComponents.length ? [{ label: 'Rate Control', formInputComponents: getSVTRateControlComponents().filter(component => component.isModified()) }] : []),
                            ...(configurationsStore.modifiedComponents.svtGOPComponents.length ? [{ label: 'GOP', formInputComponents: getSVTGOPComponents().filter(component => component.isModified()) }] : []),
                            ...(configurationsStore.modifiedComponents.svtAV1SpecificComponents.length ? [{ label: 'AV1 Specific', formInputComponents: getSVTAV1SpecificComponents().filter(component => component.isModified()) }] : []),
                        ]"
                    />
                </NTabPane>
            </template>
        </NTabs>
        <template #footer>
            <NFlex
                justify="end"
            >
                <NButton
                    type="primary"
                    @click="async () => {
                        await configurationsStore.applyChanges(projectId, taskId);
                        configurationsStore.showUnsavedChangedModal = false;

                        if (model?.to) {
                            $router.push(model.to);
                        }
                    }"
                >
                    <template #icon>
                        <NIcon>
                            <ApplyChangesIcon />
                        </NIcon>
                    </template>
                    Save Changes
                </NButton>
                <NButton
                    @click="() => {
                        // Reset configurations
                        configurationsStore.initialize(configurationsStore.configurationType, projectId, taskId, true);
                        configurationsStore.showUnsavedChangedModal = false;

                        if (model?.to) {
                            $router.push(model.to);
                        }
                    }"
                >
                    <template #icon>
                        <NIcon>
                            <RemoveIcon />
                        </NIcon>
                    </template>
                    Discard Changes
                </NButton>
            </NFlex>
        </template>
    </NModal>
</template>
