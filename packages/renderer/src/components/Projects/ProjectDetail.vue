<script setup lang="ts">
import { h, onBeforeUnmount, onMounted, ref, toRaw } from 'vue';
import { storeToRefs } from 'pinia';
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
    OverflowMenuVertical,
    TagEdit as EditNameIcon,
} from '@vicons/carbon';
import { type Project } from '../../../../shared/src/data/Projects';
import { useProjectsStore } from '../../stores/projects';

const projectsStore = useProjectsStore();
const { projects } = storeToRefs(projectsStore);

const { projectId } = defineProps<{
    projectId: Project['id'];
}>();

const projectIndex = projectsStore.projects.findIndex(project => project.id === projectId);

const dropdownOptions: DropdownOption[] = [
    {
        label: 'Delete',
        key: 'delete',
        icon: () => h(NIcon, null, { default: () => h(DeleteIcon) }),
    },
];
async function handleDropdownSelect(key: string) {
    switch (key) {
        case 'delete':
            console.log('DELETE:');
            break;
        default:
            break;
    }
}

async function revealFileLocation() {
    await window.configurationsApi['show-file'](`${projectsStore.projects[projectIndex].path}`);
}

async function updateName(name: string) {
    if (!name) {
        delete projectsStore.projects[projectIndex].name;
    }

    await projectsStore.saveProject(toRaw(projectsStore.projects[projectIndex]));
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
        :title="`${projects[projectIndex].name ?? projects[projectIndex].id} Details`"
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
                {{ projects[projectIndex].id }}
            </NDescriptionsItem>
            <NDescriptionsItem
                label="Name"
            >
                <NFlex
                    justify="space-between"
                    :wrap="false"
                >
                    <NInput
                        v-model:value="projects[projectIndex].name"
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
                        v-model:value="projects[projectIndex].path"
                        readonly
                    />
                    <NTooltip
                        :delay="500"
                        :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                    >
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
                :span=".5"
            >
                <NPopover
                    trigger="hover"
                    :delay="500"
                    :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                >
                    <template #trigger>
                        <NTime
                            :time="new Date(projects[projectIndex].createdAt)"
                            :to="new Date()"
                            type="relative"
                        />
                    </template>
                    <NTime
                        :time="new Date(projects[projectIndex].createdAt)"
                    />
                </NPopover>
            </NDescriptionsItem>
            <NDescriptionsItem
                label="Last Updated"
                :span=".5"
            >
                <NPopover
                    trigger="hover"
                    :delay="500"
                    :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                >
                    <template #trigger>
                        <NTime
                            :time="new Date(projects[projectIndex].updatedAt)"
                            :to="new Date()"
                            type="relative"
                        />
                    </template>
                    <NTime
                        :time="new Date(projects[projectIndex].updatedAt)"
                    />
                </NPopover>
            </NDescriptionsItem>
        </NDescriptions>
    </NCard>
</template>