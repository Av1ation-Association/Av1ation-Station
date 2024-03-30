<script setup lang="ts">
import {
    h,
    toRaw,
} from 'vue';
import { useRouter } from 'vue-router';
import type {
    DropdownOption} from 'naive-ui';
import {
    NLayout,
    NCard,
    NIcon,
    NTime,
    NButtonGroup,
    NButton,
    NDescriptions,
    NDescriptionsItem,
    NPopover,
    NTimeline,
    NTimelineItem,
    NDropdown,
} from 'naive-ui';
import {
    OverflowMenuVertical,
} from '@vicons/carbon';
import { useGlobalStore } from '../stores/global';
import { useProjectsStore } from '../stores/projects';
import { storeToRefs } from 'pinia';
const router = useRouter();
import { type Project } from '../../../main/src/data/Configuration/Projects';

const store = useGlobalStore();
const projectsStore = useProjectsStore();
const { config } = storeToRefs(store);
const { projects } = storeToRefs(projectsStore);

const recentProjects = store.config.recentlyOpenedProjects;
projectsStore.projects = await window.projectsApi['list-projects'](recentProjects.map(project => project.path));

// Initialize Project Task Queue Map
projectsStore.projectQueueMap = projectsStore.projects.reduce((map, project: Project) => {
    map[project.id] = {
        status: 'idle',
    };
    for (const task of project.tasks) {
        const lastStatus = task.statusHistory.length ? task.statusHistory[task.statusHistory.length - 1].state : 'idle';
        
        if (lastStatus !== 'idle') {
            map[project.id] = {
                taskId: task.id,
                status: 'paused',
            };

            break;
        }
    }

    return map;
}, {} as typeof projectsStore.projectQueueMap);

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

async function navigateToProject(project: Project) {
    const recentProjectIndex = store.config.recentlyOpenedProjects.findIndex((recentProject) => recentProject.id === project.id);
                                
    if (recentProjectIndex !== -1) {
        store.config.recentlyOpenedProjects[recentProjectIndex].accessedAt = new Date();
    } else {
        store.config.recentlyOpenedProjects.push({
            id: project.id,
            path: project.path,
            ...(project.name ? { name: project.name } : {}),
            accessedAt: new Date(),
        });
    }

    // Set config
    await store.setConfig(toRaw(store.config), true);
    // Navigate to Project Layout
    router.push(`/projects/${project.id}`);
}

</script>

<template>
    <NLayout
        content-style="padding: 24px;"
    >
        <NCard
            title="Projects"
        >
            <template #header-extra>
                <NButton
                    @click="createNewProject"
                >
                    New
                </NButton>
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
                :title="project.name ?? project.id"
            >
                <template #header-extra>
                    <NButtonGroup
                        size="small"
                    >
                        <NButton
                            @click="navigateToProject(project)"
                        >
                            View
                        </NButton>
                        <NButton
                            type="error"
                            @click="projectsStore.deleteProject(project.id)"
                        >
                            Delete
                        </NButton>
                    </NButtonGroup>
                </template>
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
                        v-if="recentProjects.find((recentProject) => recentProject.id === project.id)"
                        title="Accessed"
                        :time="(new Date(recentProjects.find((recentProject) => recentProject.id === project.id)!.accessedAt)).toLocaleString()"
                    >
                        <template #footer>
                            <NPopover
                                trigger="hover"
                            >
                                <template #trigger>
                                    <NTime
                                        :time="new Date (recentProjects.find((recentProject) => recentProject.id === project.id)!.accessedAt)"
                                        :to="new Date()"
                                        type="relative"
                                    />
                                </template>
                                <NTime
                                    :time="new Date(recentProjects.find((recentProject) => recentProject.id === project.id)!.accessedAt)"
                                />
                            </NPopover>
                        </template>
                    </NTimelineItem>
                </NTimeline>
                <!-- <NDescriptions
                    :column="1"
                    size="small"
                    label-placement="left"
                >
                    <NDescriptionsItem
                        label="Tasks"
                    >
                        {{ project.tasks.length }}
                    </NDescriptionsItem>
                </NDescriptions> -->
            </NCard>
        </NCard>
    </NLayout>
</template>
