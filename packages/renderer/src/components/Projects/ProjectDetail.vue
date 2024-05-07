<script setup lang="ts">
import { h, onBeforeUnmount, onMounted, ref } from 'vue';
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
    NInput,
    NPopover,
    NTooltip,
} from 'naive-ui';
import {
    VolumeFileStorage as RevealIcon,
    TrashCan as DeleteIcon,
    Copy as DuplicateIcon,
    OverflowMenuVertical,
    TagEdit as EditNameIcon,
} from '@vicons/carbon';
import { type Project } from '../../../../main/src/data/Configuration/Projects';
import { useProjectsStore } from '../../stores/projects';

const projectsStore = useProjectsStore();

const { projectId } = defineProps<{
    projectId: Project['id'];
}>();

const projectIndex = projectsStore.projects.findIndex(project => project.id === projectId);
const project = projectsStore.projects[projectIndex];

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

async function updateName(name: string) {
    if (!name) {
        delete project.name;
    }

    // Template string avoids passing reactive property
    await projectsStore.saveProject(`${project.id}`);
}

const columnWidths = [600, 1200, 1800, 2400, 3000, 3600, 4200, 4800];
let columnCount = ref<number>(Math.trunc(window.innerWidth / 600) + 1);

function handleResize() {
    columnCount.value = Math.trunc(window.innerWidth / 600) + 1;
}


onMounted(() => {
    columnWidths.forEach(width => {
        window.matchMedia(`(min-width: ${width}px)`).addEventListener('change', handleResize);
    });
});

onBeforeUnmount(() => {
    columnWidths.forEach(width => {
        window.matchMedia(`(min-width: ${width}px)`).removeEventListener('change', handleResize);
    });
});

</script>

<template>
    <NCard
        :title="`${project.name ?? project.id} Details`"
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
            :column="columnCount"
            size="small"
        >
            <NDescriptionsItem
                label="Id"
            >
                {{ project.id }}
            </NDescriptionsItem>
            <NDescriptionsItem
                label="Name"
            >
                <NFlex
                    justify="space-between"
                    :wrap="false"
                >
                    <NInput
                        v-model:value="project.name"
                        placeholder="Enter new name"
                        :on-change="updateName"
                    >
                        <template #suffix>
                            <NIcon>
                                <EditNameIcon />
                            </NIcon>
                        </template>
                    </NInput>
                </NFlex>
            </NDescriptionsItem>
            <NDescriptionsItem
                label="Path"
            >
                <NFlex
                    justify="space-between"
                    :wrap="false"
                >
                    <NInput
                        v-model:value="project.path"
                        readonly
                    />
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
                            :time="new Date(project.createdAt)"
                            :to="new Date()"
                            type="relative"
                        />
                    </template>
                    <NTime
                        :time="new Date(project.createdAt)"
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
                            :time="new Date(project.updatedAt)"
                            :to="new Date()"
                            type="relative"
                        />
                    </template>
                    <NTime
                        :time="new Date(project.updatedAt)"
                    />
                </NPopover>
            </NDescriptionsItem>
        </NDescriptions>
    </NCard>
</template>