<script setup lang="ts">
import {
    NFormItemGridItem,
    NButton,
    NIcon,
    NGrid,
    NH3,
    NTooltip,
} from 'naive-ui';
import {
    Reset as ResetIcon,
} from '@vicons/carbon';
import { useGlobalStore } from '../../stores/global';
import { type Project } from '../../../../shared/src/data/Projects';
import { type FormInputComponent } from '../Dependencies/library';
import { ref } from 'vue';

const store = useGlobalStore();

const model = defineModel<{
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
                    :label="`${component.label}${component.isModified() ? '*' : ''}`"
                    :path="component.path"
                >
                    <template #label>
                        {{ `${component.label}${component.isModified() ? '*' : ''}` }}
                        <!-- Sacrificial Button workaround for button inheriting sibling/parent label when using "text" option and causing double click -->
                        <NButton text />
                        <NTooltip
                            v-if="!!modelValue?.project"
                            :delay="500"
                            :style="{ padding: '5px', paddingTop: '2px', paddingBottom: '2px' }"
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
                    </template>
                    <component
                        :is="component.component"
                    />
                </NFormItemGridItem>
            </template>
        </NGrid>
    </template>
</template>
