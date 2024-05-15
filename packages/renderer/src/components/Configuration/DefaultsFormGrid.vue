<script setup lang="ts">
// import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import {
    NFormItemGridItem,
    NButton,
    NIcon,
    NGrid,
    NH3,
    NTooltip,
} from 'naive-ui';
import {
    Pin as PinIcon,
    PinFilled as PinnedIcon,
    ErrorOutline as DisableIcon,
    Reset as ResetIcon,
} from '@vicons/carbon';
import { useGlobalStore } from '../../stores/global';
import {
    type PartialChildren,
    type PartialAv1anConfiguration,
} from './ConfigurationDefaults.vue';
import {
    type Project,
    type Task,
} from '../../../../main/src/data/Configuration/Projects';
import type { FormInputComponent } from '../Av1an/library';
import { ref } from 'vue';

const store = useGlobalStore();
const { config } = storeToRefs(store);

const model = defineModel<{
    defaultsFormValue: PartialAv1anConfiguration | PartialChildren<Task['item']['Av1an']>;
    project?: Project;
}>();
const { sections } = defineProps<{
    sections: {
        label: string;
        formInputComponents: FormInputComponent[];
    }[];
}>();

const showButton = ref<Record<string, { pinned?: boolean; disable?: boolean; reset?: boolean }>>({});

function getDefaultPreferences () {
    return {
        ...store.config.preferences.defaults,
        ...model.value?.project?.preferences.defaults,
    };
}

</script>

<template>
    <template
        v-for="section in sections"
        :key="section.label"
    >
        <NH3>{{ section.label }}</NH3>
        <NGrid
            cols="1 400:2 800:3 1200:4 1600:5 2400:6 3000:7 3600:8"
            x-gap="12"
        >
            <!-- Sort by pinned -->
            <template
                v-for="component in [...section.formInputComponents].sort((a, b) => getDefaultPreferences()[a.path] === 'pinned' ? -1 : getDefaultPreferences()[b.path] === 'pinned' ? 1 : 0)"
                :key="component.path"
            >
                <NFormItemGridItem
                    v-if="!component.advanced || config.preferences.showAdvanced"
                    :label="component.label"
                    :path="component.path"
                >
                    <template #label>
                        {{ component.label }}
                        <!-- Sacrificial Button workaround for button inheriting sibling/parent label when using "text" option and causing double click -->
                        <NButton text />
                        <NTooltip
                            :delay="500"
                        >
                            <template #trigger>
                                <NButton
                                    text
                                    size="tiny"
                                    :onmouseenter="() => {
                                        if (!showButton[component.path]) {
                                            showButton[component.path] = {};
                                        }
            
                                        showButton[component.path].pinned = true;
                                    }"
                                    :onmouseleave="() => {
                                        if (!showButton[component.path]) {
                                            showButton[component.path] = {};
                                        }
                
                                        showButton[component.path].pinned = false;
                                    }"
                                    @click="() => {
                                        if (model?.project) {
                                            if (model.project.preferences.defaults[component.path] !== 'pinned') {
                                                model.project.preferences.defaults[component.path] = 'pinned';
                                            } else {
                                                // delete model.project.preferences.defaults[component.path];
                                                model.project.preferences.defaults[component.path] = 'none';
                                            }
                                        } else {
                                            if (config.preferences.defaults[component.path] !== 'pinned') {
                                                config.preferences.defaults[component.path] = 'pinned';
                                            } else {
                                                // delete config.preferences.defaults[component.path];
                                                config.preferences.defaults[component.path] = 'none';
                                            }
                                        }
                                    }"
                                >
                                    <template #icon>
                                        <NIcon
                                            :color="getDefaultPreferences()[component.path] === 'pinned' ? '#22BBFF' : undefined"
                                        >
                                            <PinnedIcon v-if="getDefaultPreferences()[component.path] === 'pinned'" />
                                            <template
                                                v-if="showButton[component.path] && showButton[component.path].pinned"
                                            >
                                                <PinIcon v-if="getDefaultPreferences()[component.path] !== 'pinned'" />
                                            </template>
                                        </NIcon>
                                    </template>
                                </NButton>
                            </template>
                            {{ getDefaultPreferences()[component.path] === 'pinned' ? 'Unpin' : 'Pin' }}
                        </NTooltip>
                        <NTooltip
                            :delay="500"
                        >
                            <template #trigger>
                                <NButton
                                    text
                                    size="tiny"
                                    :onmouseenter="() => {
                                        if (!showButton[component.path]) {
                                            showButton[component.path] = {};
                                        }

                                        showButton[component.path].reset = true;
                                    }"
                                    :onmouseleave="() => {
                                        if (!showButton[component.path]) {
                                            showButton[component.path] = {};
                                        }

                                        showButton[component.path].reset = false;
                                    }"
                                    @click="() => {
                                        component.reset();
                                    }"
                                >
                                    <template #icon>
                                        <NIcon>
                                            <ResetIcon v-if="showButton[component.path] && showButton[component.path].reset" />
                                        </NIcon>
                                    </template>
                                </NButton>
                            </template>
                            Reset
                        </NTooltip>
                        <NTooltip
                            v-if="component.disabled !== undefined && component.disable !== undefined"
                            :delay="500"
                        >
                            <template #trigger>
                                <NButton
                                    text
                                    size="tiny"
                                    :disabled="component.disabled()"
                                    :onmouseenter="() => {
                                        if (!showButton[component.path]) {
                                            showButton[component.path] = {};
                                        }

                                        showButton[component.path].disable = true;
                                    }"
                                    :onmouseleave="() => {
                                        if (!showButton[component.path]) {
                                            showButton[component.path] = {};
                                        }

                                        showButton[component.path].disable = false;
                                    }"
                                    @click="() => {
                                        if (!component.disable) {
                                            return;
                                        }
                                        component.disable();
                                    }"
                                >
                                    <template #icon>
                                        <NIcon
                                            :color="component.disabled() ? '#FF0000' : undefined"
                                        >
                                            <DisableIcon v-if="component.disabled()" />
                                            <template
                                                v-if="showButton[component.path] && showButton[component.path].disable"
                                            >
                                                <DisableIcon v-if="!component.disabled()" />
                                            </template>
                                        </NIcon>
                                    </template>
                                </NButton>
                            </template>
                            {{ component.disabled() ? 'Disabled' : 'Disable' }}
                        </NTooltip>
                    </template>
                    <component
                        :is="component.component"
                        :style="{ opacity: component.disabled && component.disabled() ? 0.5 : 1 }"
                    />
                </NFormItemGridItem>
            </template>
        </NGrid>
    </template>
</template>