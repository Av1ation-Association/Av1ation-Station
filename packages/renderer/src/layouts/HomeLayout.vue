<script setup lang="ts">
import { type DropdownOption } from 'naive-ui';
import {
    NLayout,
    NCard,
    NIcon,
    NTime,
    NButtonGroup,
    NButton,
    NPopover,
    NTimeline,
    NTimelineItem,
    NDropdown,
    NFlex,
    NStatistic,
    NText,
    NTooltip,
} from 'naive-ui';
import {
    OverflowMenuVertical,
    Add,
    TrashCan as DeleteIcon,
} from '@vicons/carbon';
import { useGlobalStore } from '../stores/global';
import { useProjectsStore } from '../stores/projects';
import { storeToRefs } from 'pinia';

const store = useGlobalStore();
const projectsStore = useProjectsStore();
const { config } = storeToRefs(store);
const { projects } = storeToRefs(projectsStore);

const dropdownOptions: DropdownOption[] = [
    {
        label: 'Open Existing',
        key: 'open-existing',
        // icon: () => h(NIcon, null, { default: () => h(RevealIcon) }),
    },
];
async function handleDropdownSelect(key: string) {
    switch (key) {
        case 'open-existing':
            await openExistingProject();
            break;
        default:
            break;
    }
}

async function createNewProject() {
    await projectsStore.createProject();
}

async function openExistingProject() {
    // TODO: Open File Dialog and load Project
}

</script>

<template>
    <NLayout
        content-style="padding: 24px;"
        :native-scrollbar="false"
    >
        <NCard>
            <template #header>
                <NFlex>
                    <NText>
                        Projects
                    </NText>
                    <NTooltip
                        :delay="500"
                        placement="right"
                        :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                    >
                        <template #trigger>
                            <NButton
                                size="small"
                                secondary
                                @click="createNewProject"
                            >
                                <template #icon>
                                    <NIcon
                                        size="28"
                                    >
                                        <Add />
                                    </NIcon>
                                </template>
                            </NButton>
                        </template>
                        New Project
                    </NTooltip>
                </NFlex>
            </template>
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
            <NFlex
                vertical
            >
                <NCard
                    v-for="project in [...projects].sort((a, b) => {
                        const aRecent = config.recentlyOpenedProjects.find((recentProject) => recentProject.id === a.id);
                        const bRecent = config.recentlyOpenedProjects.find((recentProject) => recentProject.id === b.id);

                        if (!aRecent || !bRecent) {
                            return 1;
                        }

                        const aLastOpened = new Date (config.recentlyOpenedProjects.find((recentProject) => recentProject.id === a.id)!.accessedAt);
                        const bLastOpened = new Date (config.recentlyOpenedProjects.find((recentProject) => recentProject.id === b.id)!.accessedAt);

                        return bLastOpened.getTime() - aLastOpened.getTime();
                    })"
                    :key="project.id"
                >
                    <template #header>
                        <RouterLink
                            :style="{ textDecoration: 'none' }"
                            :to="`/projects/${project.id}`"
                        >
                            <NTooltip
                                :delay="500"
                                placement="top-start"
                                :disabled="!project.name"
                                :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                            >
                                <template #trigger>
                                    <NText>{{ project.name ?? project.id }}</NText>
                                </template>
                                {{ project.id }}
                            </NTooltip>
                        </RouterLink>
                    </template>
                    <template #header-extra>
                        <NButtonGroup
                            size="small"
                        >
                            <NTooltip
                                :delay="500"
                                placement="left"
                                :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                            >
                                <template #trigger>
                                    <NButton
                                        type="error"
                                        tertiary
                                        @click="projectsStore.deleteProject(project.id)"
                                    >
                                        <template #icon>
                                            <NIcon>
                                                <DeleteIcon />
                                            </NIcon>
                                        </template>
                                    </NButton>
                                </template>
                                Delete
                            </NTooltip>
                        </NButtonGroup>
                    </template>
                    <NFlex
                        justify="center"
                        :wrap="false"
                    >
                        <NTimeline
                            horizontal
                        >
                            <NTimelineItem
                                type="success"
                                title="Created"
                                :time="(new Date(project.createdAt)).toLocaleString()"
                            >
                                <template #footer>
                                    <NPopover
                                        trigger="hover"
                                        :delay="500"
                                        placement="bottom"
                                        :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
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
                                </template>
                            </NTimelineItem>
                            <NTimelineItem
                                v-if="project.updatedAt !== project.createdAt"
                                type="info"
                                title="Updated"
                                :time="(new Date(project.updatedAt)).toLocaleString()"
                            >
                                <template #footer>
                                    <NPopover
                                        trigger="hover"
                                        :delay="500"
                                        placement="bottom"
                                        :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                                    >
                                        <template #trigger>
                                            <NTime
                                                :time="new Date (project.updatedAt)"
                                                :to="new Date()"
                                                type="relative"
                                            />
                                        </template>
                                        <NTime
                                            :time="new Date(project.updatedAt)"
                                        />
                                    </NPopover>
                                </template>
                            </NTimelineItem>
                            <NTimelineItem
                                v-if="config.recentlyOpenedProjects.find((recentProject) => recentProject.id === project.id)"
                                title="Accessed"
                                :time="(new Date(config.recentlyOpenedProjects.find((recentProject) => recentProject.id === project.id)!.accessedAt)).toLocaleString()"
                            >
                                <template #footer>
                                    <NPopover
                                        trigger="hover"
                                        :delay="500"
                                        placement="bottom"
                                        :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                                    >
                                        <template #trigger>
                                            <NTime
                                                :time="new Date (config.recentlyOpenedProjects.find((recentProject) => recentProject.id === project.id)!.accessedAt)"
                                                :to="new Date()"
                                                type="relative"
                                            />
                                        </template>
                                        <NTime
                                            :time="new Date(config.recentlyOpenedProjects.find((recentProject) => recentProject.id === project.id)!.accessedAt)"
                                        />
                                    </NPopover>
                                </template>
                            </NTimelineItem>
                        </NTimeline>
                        <NStatistic
                            label="Tasks Completed"
                            :value="project.tasks.reduce((count, task) => count + ((task.statusHistory.length ? task.statusHistory[task.statusHistory.length - 1].state : 'idle') === 'done' ? 1 : 0), 0)"
                        >
                            <template #suffix>
                                / {{ project.tasks.length }}
                            </template>
                        </NStatistic>
                    </NFlex>
                </NCard>
            </NFlex>
        </NCard>
    </NLayout>
</template>
