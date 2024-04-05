<script setup lang="ts">
import { h } from 'vue';
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
        case 'reveal':
            await revealFileLocation();
            break;
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

async function revealFileLocation() {
    await window.configurationsApi['show-file'](`${project.path}`);
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
                    <!-- <span>{{ task.item.input }}</span> -->
                    [REDACTED]
                    <NTooltip>
                        <template #trigger>
                            <NButton
                                circle
                                quaternary
                                @click="revealFileLocation"
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
                    <!-- <span>{{ task.item.output }}</span> -->
                    [REDACTED]
                    <NTooltip>
                        <template #trigger>
                            <NButton
                                circle
                                quaternary
                                @click="revealFileLocation"
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