<script setup lang="ts">
import { h, toRaw, ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
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
    NPopover,
    NTooltip,
    NInputGroup,
    NInput,
    NText,
    NAlert,
    useModal,
    useMessage,
} from 'naive-ui';
import {
    VolumeFileStorage as RevealIcon,
    TrashCan as DeleteIcon,
    OverflowMenuVertical,
    ResetAlt as ResetIcon,
    DocumentView as ViewLogsIcon,
    Reset as ResetIconCircle,
} from '@vicons/carbon';
import { type Project, type Task } from '../../../../shared/src/data/Projects';
import { useProjectsStore } from '../../stores/projects';
import TaskProgress from './TaskProgress.vue';

const router = useRouter();

const projectsStore = useProjectsStore();
const { projects } = storeToRefs(projectsStore);

const { projectId, taskId } = defineProps<{
    projectId: Project['id'];
    taskId: Task['id'];
}>();

const projectIndex = projectsStore.projects.findIndex(project => project.id === projectId);
const taskIndex = projectsStore.projects[projectIndex].tasks.findIndex(task => task.id === taskId);

const message = useMessage();
const modal = useModal();

function generateDropdownOptions(): DropdownOption[] {
    return [
        {
            label: 'Delete',
            key: 'delete',
            disabled: projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id].status === 'processing' && projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id].taskId === projectsStore.projects[projectIndex].tasks[taskIndex].id,
            icon: () => h(NIcon, null, { default: () => h(DeleteIcon) }),
        },
    ];
}
async function handleDropdownSelect(key: string) {
    switch (key) {
        case 'delete':
            if (taskStarted() && !taskCompleted()) {
                const checkModal = modal.create({
                    preset: 'dialog',
                    title: 'Delete Task in Progress?',
                    type: 'warning',
                    content: 'All progress will be lost. This will cancel the task and delete the temporary files.',
                    positiveText: 'Delete',
                    positiveButtonProps: {
                        renderIcon: () => h(NIcon, null, { default: () => h(DeleteIcon) }),
                        type: 'error',
                    },
                    negativeText: 'Cancel',
                    onPositiveClick: async () => {
                        const projectId = projectsStore.projects[projectIndex].id;
                        const outputFileName = projectsStore.projects[projectIndex].tasks[taskIndex].outputFileName;

                        await router.push(`/projects/${projectId}`);
                        await projectsStore.deleteTask(projectsStore.projects[projectIndex].tasks[taskIndex]);
                        message.success(`Task ${outputFileName} Deleted`);
                        checkModal.destroy();
                    },
                });
            } else {
                const projectId = projectsStore.projects[projectIndex].id;
                const outputFileName = projectsStore.projects[projectIndex].tasks[taskIndex].outputFileName;

                await router.push(`/projects/${projectId}`);
                await projectsStore.deleteTask(projectsStore.projects[projectIndex].tasks[taskIndex]);
                message.success(`Task ${outputFileName} Deleted`);
            }
            break;
        default:
            break;
    }
}
function generateProgressDropdownOptions(): DropdownOption[] {
    return [
        {
            label: 'Reset Progress',
            key: 'reset',
            disabled: projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id].status === 'processing' && projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id].taskId === projectsStore.projects[projectIndex].tasks[taskIndex].id,
            icon: () => h(NIcon, null, { default: () => h(ResetIcon) }),
        },
        {
            label: 'View Av1an Logs',
            key: 'view-av1an-logs',
            disabled: !taskStarted(),
            icon: () => h(NIcon, null, { default: () => h(ViewLogsIcon) }),
        },
    ];
}
async function handleProgressDropdownSelect(key: string) {
    switch (key) {
        case 'reset':
            await projectsStore.resetTask(projectsStore.projects[projectIndex].tasks[taskIndex]);
            break;
        case 'view-av1an-logs':
            router.push(`/projects/${projectsStore.projects[projectIndex].id}/tasks/${projectsStore.projects[projectIndex].tasks[taskIndex].id}/av1an-logs`);
            break;
        default:
            break;
    }
}

async function selectInputFile() {
    const inputFilePath = await window.configurationsApi['open-file'](projectsStore.projects[projectIndex].tasks[taskIndex].item.Av1an.input, 'Select Input File');

    if (!inputFilePath.length || inputFilePath[0] === projectsStore.projects[projectIndex].tasks[taskIndex].item.Av1an.input) {
        return;
    }

    if (taskStarted()) {
        // Reset task progress
        await projectsStore.resetTask(projectsStore.projects[projectIndex].tasks[taskIndex], false);
    }

    // Update Input File
    const inputFileName = await window.configurationsApi['path-basename'](inputFilePath[0], true);
    projectsStore.projects[projectIndex].tasks[taskIndex].item.Av1an.input = inputFilePath[0];
    projectsStore.projects[projectIndex].tasks[taskIndex].inputFileName = inputFileName;

    const { outputFilePath, temporaryFolderPath, scenesFilePath } = await projectsStore.buildDefaultTaskPaths(toRaw(projectsStore.projects[projectIndex]), projectsStore.projects[projectIndex].tasks[taskIndex].id, inputFilePath[0]);

    // Update Output File
    if (!projectsStore.projects[projectIndex].tasks[taskIndex].outputFileOveridden) {
        const outputFileName = await window.configurationsApi['path-basename'](outputFilePath, true);

        projectsStore.projects[projectIndex].tasks[taskIndex].item.Av1an.output = outputFilePath;
        projectsStore.projects[projectIndex].tasks[taskIndex].outputFileName = outputFileName;
    }

    // Update Temporary Folder Path and Scenes File Path
    if (!projectsStore.projects[projectIndex].tasks[taskIndex].item.Av1an.scenes) {
        projectsStore.projects[projectIndex].tasks[taskIndex].item.Av1an.scenes = {};
    }

    projectsStore.projects[projectIndex].tasks[taskIndex].item.Av1an.scenes!.path = scenesFilePath;
    projectsStore.projects[projectIndex].tasks[taskIndex].item.Av1an.temporary.path = temporaryFolderPath;

    // Reset task updatedAt
    projectsStore.projects[projectIndex].tasks[taskIndex].updatedAt = new Date();

    // Save Project File
    await projectsStore.saveProject(toRaw(projectsStore.projects[projectIndex]), false);
}

async function selectOutputFile() {
    const outputFilePath = await window.configurationsApi['save-file'](projectsStore.projects[projectIndex].tasks[taskIndex].item.Av1an.output, 'Select Output File');

    if (!outputFilePath.length || outputFilePath === projectsStore.projects[projectIndex].tasks[taskIndex].item.Av1an.output) {
        return;
    }

    if (taskCompleted()) {
        // Move/Rename the output file
        await window.configurationsApi['move-file'](projectsStore.projects[projectIndex].tasks[taskIndex].item.Av1an.output, outputFilePath);
    }

    const outputFileName = await window.configurationsApi['path-basename'](outputFilePath, true);
    projectsStore.projects[projectIndex].tasks[taskIndex].item.Av1an.output = outputFilePath;
    projectsStore.projects[projectIndex].tasks[taskIndex].outputFileName = outputFileName;
    projectsStore.projects[projectIndex].tasks[taskIndex].outputFileOveridden = true;

    // Reset task updatedAt
    projectsStore.projects[projectIndex].tasks[taskIndex].updatedAt = new Date();

    // Save Project File
    await projectsStore.saveProject(toRaw(projectsStore.projects[projectIndex]), false);
}

async function resetOutputFile() {
    const { outputFilePath } = await projectsStore.buildDefaultTaskPaths(toRaw(projectsStore.projects[projectIndex]), projectsStore.projects[projectIndex].tasks[taskIndex].id, projectsStore.projects[projectIndex].tasks[taskIndex].item.Av1an.input);
    const outputFileName = await window.configurationsApi['path-basename'](outputFilePath, true);
    
    // Update Output File
    projectsStore.projects[projectIndex].tasks[taskIndex].item.Av1an.output = outputFilePath;
    projectsStore.projects[projectIndex].tasks[taskIndex].outputFileName = outputFileName;
    projectsStore.projects[projectIndex].tasks[taskIndex].outputFileOveridden = false;

    // Reset task updatedAt
    projectsStore.projects[projectIndex].tasks[taskIndex].updatedAt = new Date();

    // Save Project File
    await projectsStore.saveProject(toRaw(projectsStore.projects[projectIndex]), false);
}

async function revealFileLocation(path: string) {
    await window.configurationsApi['show-file'](path);
}

function taskStarted() {
    return projectsStore.taskStarted(toRaw(projectsStore.projects[projectIndex].tasks[taskIndex]));
}

function taskCompleted() {
    return projectsStore.taskCompleted(toRaw(projectsStore.projects[projectIndex].tasks[taskIndex]));
}

// #region Column Width
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

// #endregion Column Width

</script>

<template>
    <NCard
        :title="`${projects[projectIndex].tasks[taskIndex].outputFileName} Details`"
    >
        <template #header-extra>
            <NDropdown
                trigger="click"
                :options="generateDropdownOptions()"
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
            <NDescriptions
                bordered
                :column="columnCount"
                size="small"
            >
                <NDescriptionsItem
                    label="Id"
                >
                    {{ projects[projectIndex].tasks[taskIndex].id }}
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
                                v-model:value="projects[projectIndex].tasks[taskIndex].item.Av1an.input"
                                readonly
                            />
                            <NTooltip
                                :delay="500"
                                :style="!taskStarted() ? { padding: '10px', paddingTop: '2px', paddingBottom: '2px' } : { padding: 0, maxWidth: '200px' }"
                            >
                                <template #trigger>
                                    <NButton
                                        :type="!taskStarted() ? undefined : taskCompleted() ? 'warning' : 'error'"
                                        :disabled="taskStarted() && !taskCompleted()"
                                        @click="selectInputFile"
                                    >
                                        {{ taskStarted() ? 'Change' : 'Select' }}
                                    </NButton>
                                </template>
                                <template
                                    v-if="!taskStarted()"
                                >
                                    Select Input File
                                </template>
                                <template
                                    v-else-if="taskCompleted()"
                                >
                                    <NAlert
                                        type="warning"
                                    >
                                        Changing the input file will also reset this task.
                                    </NAlert>
                                </template>
                                <template
                                    v-else
                                >
                                    <NAlert
                                        title="Cannot change Input while Task is in progress!"
                                        type="error"
                                    >
                                        Stop and reset to change the input file.
                                    </NAlert>
                                </template>
                            </NTooltip>
                        </NInputGroup>
                        <NTooltip
                            :delay="500"
                            :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                        >
                            <template #trigger>
                                <NButton
                                    circle
                                    quaternary
                                    @click="() => revealFileLocation(projects[projectIndex].tasks[taskIndex].item.Av1an.input)"
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
                <NDescriptionsItem>
                    <template #label>
                        Output
                        <NTooltip
                            v-if="projects[projectIndex].tasks[taskIndex].outputFileOveridden"
                            :delay="500"
                            :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                        >
                            <template #trigger>
                                <NButton
                                    text
                                    size="small"
                                    :disabled="taskStarted() && !taskCompleted()"
                                    @click="resetOutputFile"
                                >
                                    <template #icon>
                                        <NIcon>
                                            <ResetIconCircle />
                                        </NIcon>
                                    </template>
                                </NButton>
                            </template>
                            Reset to default
                        </NTooltip>
                    </template>
                    <NFlex
                        justify="space-between"
                        :wrap="false"
                    >
                        <NInputGroup>
                            <NInput
                                v-model:value="projects[projectIndex].tasks[taskIndex].item.Av1an.output"
                                readonly
                            />
                            <NTooltip
                                :delay="500"
                                :style="taskStarted() && !taskCompleted() ? { padding: '0', maxWidth: '300px' } : { padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                            >
                                <template #trigger>
                                    <NButton
                                        :type="taskStarted() && !taskCompleted() ? 'error' : undefined"
                                        :disabled="taskStarted() && !taskCompleted()"
                                        @click="selectOutputFile"
                                    >
                                        {{ taskStarted() && taskCompleted() ? 'Move' : 'Select' }}
                                    </NButton>
                                </template>
                                <template
                                    v-if="taskStarted() && !taskCompleted()"
                                >
                                    <NAlert
                                        title="Cannot change Output while Task is in progress!"
                                        type="error"
                                    >
                                        Stop and reset or wait for task to complete to change the output file location/name.
                                    </NAlert>
                                </template>
                                <template
                                    v-else-if="taskCompleted()"
                                >
                                    Move Output File
                                </template>
                                <template
                                    v-else
                                >
                                    Change Output File Location
                                </template>
                            </NTooltip>
                        </NInputGroup>
                        <NTooltip
                            :delay="500"
                            :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                        >
                            <template #trigger>
                                <NButton
                                    circle
                                    quaternary
                                    :disabled="!taskCompleted()"
                                    @click="() => revealFileLocation(projects[projectIndex].tasks[taskIndex].item.Av1an.output)"
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
                    label="Av1an Temporary"
                >
                    <NFlex
                        justify="space-between"
                        :wrap="false"
                    >
                        <NInput
                            v-model:value="projects[projectIndex].tasks[taskIndex].item.Av1an.temporary.path"
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
                                    :disabled="!taskStarted()"
                                    @click="() => revealFileLocation(projects[projectIndex].tasks[taskIndex].item.Av1an.temporary.path)"
                                >
                                    <template #icon>
                                        <NIcon>
                                            <RevealIcon />
                                        </NIcon>
                                    </template>
                                </NButton>
                            </template>
                            Open Directory
                        </NTooltip>
                    </NFlex>
                </NDescriptionsItem>
                <NDescriptionsItem
                    label="Created"
                    :span=".5"
                >
                    <NPopover
                        trigger="hover"
                        placement="right"
                        :delay="500"
                        :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                    >
                        <template #trigger>
                            <NTime
                                :time="new Date(projects[projectIndex].tasks[taskIndex].createdAt)"
                                :to="new Date()"
                                type="relative"
                            />
                        </template>
                        <NTime
                            :time="new Date(projects[projectIndex].tasks[taskIndex].createdAt)"
                        />
                    </NPopover>
                </NDescriptionsItem>
                <NDescriptionsItem
                    label="Last Updated"
                    :span=".5"
                >
                    <NPopover
                        trigger="hover"
                        placement="right"
                        :delay="500"
                        :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                    >
                        <template #trigger>
                            <NTime
                                :time="new Date(projects[projectIndex].tasks[taskIndex].updatedAt)"
                                :to="new Date()"
                                type="relative"
                            />
                        </template>
                        <NTime
                            :time="new Date(projects[projectIndex].tasks[taskIndex].updatedAt)"
                        />
                    </NPopover>
                </NDescriptionsItem>
            </NDescriptions>
            <NCard
                size="small"
            >
                <template #header>
                    <RouterLink
                        :style="{ textDecoration: 'none' }"
                        :to="`/projects/${projects[projectIndex].id}/tasks/${taskId}/status-history`"
                    >
                        <NText>Progress Status</NText>
                    </RouterLink>
                </template>
                <template #header-extra>
                    <NDropdown
                        trigger="click"
                        :options="generateProgressDropdownOptions()"
                        @select="handleProgressDropdownSelect"
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
                <TaskProgress
                    :project-id="projectId"
                    :task-id="taskId"
                />
            </NCard>
        </NFlex>
    </NCard>
</template>