<script setup lang="ts">
import {
    ref,
} from 'vue';
import {
    type RouteLocationNormalized,
    onBeforeRouteLeave,
} from 'vue-router';
import {
    NIcon,
    NFloatButton,
    NTooltip,
} from 'naive-ui';
import {
    Save as SaveIcon,
    SaveAnnotation,
    ChangeCatalog as ReviewChangesIcon,
    Delete as DiscardIcon,
} from '@vicons/carbon';
import {
    ConfigurationType,
} from '../../../../shared/src/data/Configuration';
import{
    type Project,
    type Task,
} from '../../../../shared/src/data/Projects';
import { useConfigurationsStore } from '../../stores/configurations';
import UnsavedChangesModal from './UnsavedChangesModal.vue';

const { projectId, taskId } = defineProps<{
    projectId?: Project['id'];
    taskId?: Task['id'];
}>();

const modalTo = ref<RouteLocationNormalized>();

const configurationsStore = useConfigurationsStore<ConfigurationType.Config>();

onBeforeRouteLeave((to) => {
    configurationsStore.updateModifiedComponents();
    if (Object.values(configurationsStore.modifiedComponents).some(components => components.length)) {
        modalTo.value = to;

        configurationsStore.showUnsavedChangedModal = true;

        return false;
    }
});

</script>

<template>
    <Transition
        name="savebar"
    >
        <NFloatButton
            v-if="Object.values(configurationsStore.updateModifiedComponents()).some(components => components.length)"
            shape="square"
            menu-trigger="hover"
            :bottom="30"
            :right="30"
        >
            <NIcon
                :component="SaveAnnotation"
            />
            <template #menu>
                <NTooltip
                    placement="left"
                    :delay="500"
                    :style="{ padding: '10px', paddingTop: '5px', paddingBottom: '5px' }"
                >
                    <template #trigger>
                        <span>
                            <NFloatButton
                                shape="square"
                                type="primary"
                                @click="() => configurationsStore.applyChanges(projectId, taskId)"
                            >
                                <NIcon
                                    :component="SaveIcon"
                                />
                            </NFloatButton>
                        </span>
                    </template>
                    Save and Apply Changes
                </NTooltip>
                <NTooltip
                    placement="right"
                    :delay="500"
                    :style="{ padding: '10px', paddingTop: '5px', paddingBottom: '5px' }"
                >
                    <template #trigger>
                        <span>
                            <NFloatButton
                                shape="square"
                                @click="() => {
                                    configurationsStore.updateModifiedComponents();
                                    configurationsStore.showUnsavedChangedModal = true;
                                }"
                            >
                                <NIcon
                                    :component="ReviewChangesIcon"
                                />
                            </NFloatButton>
                        </span>
                    </template>
                    Review Changes
                </NTooltip>
                <NTooltip
                    :delay="500"
                    :style="{ padding: '5px', paddingTop: '2px', paddingBottom: '2px' }"
                    placement="right"
                >
                    <template #trigger>
                        <!-- Workaround for Naive-UI PopOver trigger not working with Float Button https://github.com/tusen-ai/naive-ui/issues/5933#issuecomment-2106575777 -->
                        <span>
                            <NFloatButton
                                shape="square"
                                @click="() => {
                                    configurationsStore.initialize(taskId ? ConfigurationType.Task : projectId ? ConfigurationType.Project : ConfigurationType.Config, projectId, taskId, true);
                                }"
                            >
                                <NIcon
                                    :component="DiscardIcon"
                                />
                            </NFloatButton>
                        </span>
                    </template>
                    Discard Changes
                </NTooltip>
            </template>
        </NFloatButton>
    </Transition>
    <UnsavedChangesModal
        :project-id="projectId"
        :task-id="taskId"
        :model-value="{
            to: modalTo,
        }"
    />
</template>

<style>

.savebar-enter-active {
    transition: all 0.2s ease-in;
}
.savebar-leave-active {
    transition: all 0.2s ease-out;
}

.savebar-enter-from,
.savebar-leave-to {
    opacity: 0;
    transform: translateY(20px);
}

</style>