<script setup lang="ts">
// import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import {
    NFormItemGridItem,
    NButton,
    NIcon,
    NGrid,
} from 'naive-ui';
import {
    Star as FavoriteIcon,
    StarFilled as FavoritedIcon,
} from '@vicons/carbon';
import { useGlobalStore } from '../../stores/global';
import { type PartialAv1anConfiguration } from './ConfigurationDefaults.vue';
import { type Project } from '../../../../main/src/data/Configuration/Projects';
import type { FormInputComponent } from '../Av1an/library';
import { ref } from 'vue';

const store = useGlobalStore();
const { config } = storeToRefs(store);

const model = defineModel<{
    defaultsFormValue: PartialAv1anConfiguration;
    project?: Project;
}>();
const { formInputComponents } = defineProps<{
    formInputComponents: FormInputComponent[];
}>();

const showFavorite = ref<Record<string, boolean>>({});

function getDefaultPreferences () {
    return {
        ...store.config.preferences.defaults,
        ...model.value?.project?.preferences.defaults,
    };
}

</script>

<template>
    <NGrid
        :span="24"
        :x-gap="24"
    >
        <!-- Sort by favorite -->
        <NFormItemGridItem
            v-for="component in [...formInputComponents].sort((a, b) => getDefaultPreferences()[a.path] === 'favorite' ? -1 : getDefaultPreferences()[b.path] === 'favorite' ? 1 : 0)"
            :key="component.path"
            :label="component.label"
            :path="component.path"
            :span="12"
        >
            <template #label>
                {{ component.label }}
                <!-- Sacrificial Button workaround for button inheriting sibling/parent label when using "text" option and causing double click -->
                <NButton text />
                <NButton
                    text
                    size="tiny"
                    :onmouseenter="() => {
                        showFavorite[component.path] = true;
                    }"
                    :onmouseleave="() => {
                        showFavorite[component.path] = false;
                    }"
                    @click="() => {
                        if (model?.project) {
                            if (model.project.preferences.defaults[component.path] !== 'favorite') {
                                model.project.preferences.defaults[component.path] = 'favorite';
                            } else {
                                // delete model.project.preferences.defaults[component.path];
                                model.project.preferences.defaults[component.path] = 'none';
                            }
                        } else {
                            if (config.preferences.defaults[component.path] !== 'favorite') {
                                config.preferences.defaults[component.path] = 'favorite';
                            } else {
                                // delete config.preferences.defaults[component.path];
                                config.preferences.defaults[component.path] = 'none';
                            }
                        }
                    }"
                >
                    <template #icon>
                        <NIcon
                            :color="getDefaultPreferences()[component.path] === 'favorite' ? '#FFD700' : undefined"
                        >
                            <FavoritedIcon v-if="getDefaultPreferences()[component.path] === 'favorite'" />
                            <template
                                v-if="showFavorite[component.path]"
                            >
                                <FavoriteIcon v-if="getDefaultPreferences()[component.path] !== 'favorite'" />
                            </template>
                        </NIcon>
                    </template>
                </NButton>
            </template>
            <component
                :is="component.component"
            />
        </NFormItemGridItem>
    </NGrid>
</template>