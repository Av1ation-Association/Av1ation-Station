<script setup lang="ts">
import { h, toRaw } from 'vue';
import {
    NDropdown,
    type DropdownOption,
    NButton,
    NFlex,
    NCard,
    NIcon,
    NTime,
    NDescriptions,
    NDescriptionsItem,
    NPopover,
    NTooltip,
    NInputGroup,
    NInput,
} from 'naive-ui';
import {
    VolumeFileStorage as RevealIcon,
    TrashCan as DeleteIcon,
    Copy as DuplicateIcon,
    OverflowMenuVertical,
    // TagEdit as EditNameIcon,
} from '@vicons/carbon';
import { type Project, type Task } from '../../../../main/src/data/Configuration/Projects';
import { useProjectsStore } from '../../stores/projects';

const projectsStore = useProjectsStore();
// const { projects } = storeToRefs(projectsStore);

const { projectId, taskId } = defineProps<{
    projectId: Project['id'];
    taskId: Task['id'];
}>();

const projectIndex = projectsStore.projects.findIndex(project => project.id === projectId);
const project = projectsStore.projects[projectIndex];
const taskIndex = project.tasks.findIndex(task => task.id === taskId);
const task = project.tasks[taskIndex];

const dropdownOptions: DropdownOption[] = [
    {
        label: 'Open File Location',
        key: 'reveal',
        icon: () => h(NIcon, null, { default: () => h(RevealIcon) }),
    },
    {
        label: 'Duplicate',
        key: 'duplicate',
        icon: () => h(NIcon, null, { default: () => h(DuplicateIcon) }),
    },
    {
        label: 'Delete',
        key: 'delete',
        icon: () => h(NIcon, null, { default: () => h(DeleteIcon) }),
    },
];
async function handleDropdownSelect(key: string) {
    switch (key) {
        case 'duplicate':
            console.log('DUPLICATE: ', project.path);
            break;
        case 'delete':
            console.log('DELETE: ', project.path);
            break;
        default:
            break;
    }
}

async function selectInputFile() {
    const inputFilePath = await window.configurationsApi['open-file'](task.item.Av1an.input, 'Select Input File');

    if (inputFilePath.length) {
        const inputFileName = await window.configurationsApi['path-basename'](inputFilePath[0], true);
        task.item.Av1an.input = inputFilePath[0];
        task.inputFileName = inputFileName;
    }

    // Reset task updatedAt
    project.tasks[taskIndex].updatedAt = new Date();

    // Save Project File
    await projectsStore.saveProject(toRaw(project), false);
}

async function selectOutputFile() {
    const outputFilePath = await window.configurationsApi['save-file'](task.item.Av1an.output, 'Select Output File');

    if (outputFilePath) {
        const outputFileName = await window.configurationsApi['path-basename'](outputFilePath, true);
        task.item.Av1an.output = outputFilePath;
        task.outputFileName = outputFileName;
    }

    // Reset task updatedAt
    project.tasks[taskIndex].updatedAt = new Date();

    // Save Project File
    await projectsStore.saveProject(toRaw(project), false);
}

async function revealFileLocation(path: string) {
    await window.configurationsApi['show-file'](path);
}

</script>

<template>
    <NCard
        :title="`${task.outputFileName} Details`"
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
        <NDescriptions
            bordered
            :column="1"
            size="small"
        >
            <NDescriptionsItem
                label="Id"
            >
                {{ task.id }}
            </NDescriptionsItem>
            <NDescriptionsItem
                label="Input"
            >
                <NFlex
                    justify="space-between"
                    :wrap="false"
                >
                    <NInputGroup>
                        <NInput
                            v-model:value="task.item.Av1an.input"
                            readonly
                        />
                        <NButton
                            @click="selectInputFile"
                        >
                            Select
                        </NButton>
                    </NInputGroup>
                    <NTooltip>
                        <template #trigger>
                            <NButton
                                circle
                                quaternary
                                @click="() => revealFileLocation(task.item.Av1an.input)"
                            >
                                <template #icon>
                                    <NIcon>
                                        <RevealIcon />
                                    </NIcon>
                                </template>
                            </NButton>
                        </template>
                        Open File Location
                    </NTooltip>
                </NFlex>
            </NDescriptionsItem>
            <NDescriptionsItem
                label="Output"
            >
                <NFlex
                    justify="space-between"
                    :wrap="false"
                >
                    <NInputGroup>
                        <NInput
                            v-model:value="task.item.Av1an.output"
                            readonly
                        />
                        <NButton
                            @click="selectOutputFile"
                        >
                            Select
                        </NButton>
                    </NInputGroup>
                    <NTooltip>
                        <template #trigger>
                            <NButton
                                circle
                                quaternary
                                :disabled="task.statusHistory.length > 0 && task.statusHistory[task.statusHistory.length - 1].state !== 'done'"
                                @click="() => revealFileLocation(task.item.Av1an.output)"
                            >
                                <template #icon>
                                    <NIcon>
                                        <RevealIcon />
                                    </NIcon>
                                </template>
                            </NButton>
                        </template>
                        Open File Location
                    </NTooltip>
                </NFlex>
            </NDescriptionsItem>
            <NDescriptionsItem
                label="Created"
            >
                <NPopover
                    trigger="hover"
                    placement="right"
                >
                    <template #trigger>
                        <NTime
                            :time="new Date(task.createdAt)"
                            :to="new Date()"
                            type="relative"
                        />
                    </template>
                    <NTime
                        :time="new Date(task.createdAt)"
                    />
                </NPopover>
            </NDescriptionsItem>
            <NDescriptionsItem
                label="Last Updated"
            >
                <NPopover
                    trigger="hover"
                    placement="right"
                >
                    <template #trigger>
                        <NTime
                            :time="new Date(task.updatedAt)"
                            :to="new Date()"
                            type="relative"
                        />
                    </template>
                    <NTime
                        :time="new Date(task.updatedAt)"
                    />
                </NPopover>
            </NDescriptionsItem>
        </NDescriptions>
    </NCard>
</template>