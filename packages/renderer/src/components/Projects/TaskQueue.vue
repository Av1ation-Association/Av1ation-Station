<script setup lang="ts">
import { h, ref, toRaw } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import { storeToRefs } from 'pinia';
import {
    NDropdown,
    type DropdownOption,
    NButton,
    NButtonGroup,
    NFlex,
    NCard,
    NIcon,
    NText,
    NTooltip,
    NInput,
    NModal,
} from 'naive-ui';
import {
    Add,
    VolumeFileStorage as RevealIcon,
    TrashCan as DeleteIcon,
    Close as SkipIcon,
    Copy as CopyIcon,
    OverflowMenuVertical,
    CheckboxIndeterminate,
    CheckboxChecked,
    ResetAlt,
    Code as ScriptIcon,
    PlayFilledAlt as StartIcon,
    StopFilledAlt as StopIcon,
} from '@vicons/carbon';
import { useProjectsStore } from '../../stores/projects';
import {
    // type Project,
    type Task,
} from '../../../../main/src/data/Configuration/Projects';
import TaskProgress from './TaskProgress.vue';

const projectsStore = useProjectsStore();
const { projectQueueMap, projects } = storeToRefs(projectsStore);

const { projectId } = defineProps<{
    projectId: string;
}>();

const projectIndex = projectsStore.projects.findIndex(project => project.id === projectId);

const showBatchAv1anCommandModal = ref(false);
const showAv1anPrintFriendlyCommand = ref(false);
let batchAv1anCommand = { batchCommand: '', printFriendlyBatchCommand: '' };

// #region Dropdown
function generateDropdownOptions(): DropdownOption[] {
    return [
        {
            label: 'Skip All',
            key: 'skip-all',
            disabled: projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id].status === 'processing',
            icon: () => h(NIcon, null, { default: () => h(SkipIcon) }),
        },
        {
            label: 'Remove All',
            key: 'remove-all',
            disabled: projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id].status === 'processing',
            icon: () => h(NIcon, null, { default: () => h(DeleteIcon) }),
        },
        {
            label: 'Reset All',
            key: 'reset-all',
            disabled: projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id].status === 'processing',
            icon: () => h(NIcon, null, { default: () => h(ResetAlt) }),
        },
        {
            label: 'Preview Batch Script',
            key: 'preview-batch',
            icon: () => h(NIcon, null, { default: () => h(ScriptIcon) }),
        },
    ];
}
async function handleDropdownSelect(key: string) {
    switch (key) {
        case 'skip-all': {
            projectsStore.projects[projectIndex].tasks.forEach((_task, index) => {
                projectsStore.projects[projectIndex].tasks[index].skip = true;
            });

            await projectsStore.saveProject(toRaw(projectsStore.projects[projectIndex]), false);
            break;
        }
        case 'remove-all': {
            await Promise.all(projectsStore.projects[projectIndex].tasks.map(task => projectsStore.deleteTask(toRaw(task), false)));

            // Reset QueueMap
            projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id] = {
                status: 'idle',
            };

            await projectsStore.saveProject(toRaw(projectsStore.projects[projectIndex]), false);
            break;
        }
        case 'reset-all': {
            await Promise.all(projectsStore.projects[projectIndex].tasks.map(task => projectsStore.resetTask(task, false)));

            await projectsStore.saveProject(toRaw(projectsStore.projects[projectIndex]), false);
            break;
        }
        case 'preview-batch': {
            // TODO: Adjust for bash, powershell, etc. Comment out skipped tasks
            const taskAv1anArgs = (await Promise.all(projectsStore.projects[projectIndex].tasks.map(task => buildAv1anArgs(task)))).filter(args => args) as { arguments: string[]; printFriendlyArguments: string[] }[];
            batchAv1anCommand.batchCommand = taskAv1anArgs.map(args => `av1an ${args.arguments.join(' ')}`).join('\n');
            batchAv1anCommand.printFriendlyBatchCommand = taskAv1anArgs.map(args => `av1an ${args.printFriendlyArguments.join(' ')} --print-friendly`).join('\n');
            showBatchAv1anCommandModal.value = true;
            break;
        }
        default:
            break;
    }
}

function generateTaskDropdownOptions(task: Task): DropdownOption[] {
    return [
        {
            label: 'Open Input File Location',
            key: 'revealinput',
            icon: () => h(NIcon, null, { default: () => h(RevealIcon) }),
        },
        {
            label: 'Open Output File Location',
            key: 'revealoutput',
            disabled: !projectsStore.taskCompleted(toRaw(task)),
            icon: () => h(NIcon, null, { default: () => h(RevealIcon) }),
        },
        {
            label: 'Open Av1an Temporary Directory',
            key: 'revealtemp',
            disabled: !projectsStore.taskStarted(toRaw(task)),
            icon: () => h(NIcon, null, { default: () => h(RevealIcon) }),
        },
        {
            label: 'Copy Av1an Command',
            key: 'copycommand',
            icon: () => h(NIcon, null, { default: () => h(CopyIcon) }),
        },
        {
            label: 'Reset Progress',
            key: 'resetprogress',
            disabled: projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id].status === 'processing' && projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id].taskId === task.id,
            icon: () => h(NIcon, null, { default: () => h(ResetAlt) }),
        },
    ];
}

async function handleTaskDropdownSelect(task: Task, key: string) {
    switch (key) {
        case 'revealinput': {
            await window.configurationsApi['show-file'](`${task.item.Av1an.input}`);
            break;
        }
        case 'revealoutput': {
            await window.configurationsApi['show-file'](`${task.item.Av1an.output}`);
            break;
        }
        case 'revealtemp': {
            await window.configurationsApi['show-file'](`${task.item.Av1an.temporary.path}`);
            break;
        }
        case 'copycommand': {
            const args = await buildAv1anArgs(task);
            if (!args) {
                break;
            }

            await window.configurationsApi['copy-to-clipboard'](`av1an ${args.printFriendlyArguments.join(' ')}`);
            break;
        }
        case 'resetprogress': {
            await projectsStore.resetTask(task);
            break;
        }
        default:
            break;
    }
}

// #endregion

// #region Task Lifecycle

// Register Task Status Listener
if (!projectsStore.taskStatusListenerRegistered) {
    await projectsStore.registerTaskListeners();
}

async function addTask() {
    // Import video or vapoursynth script from file dialog
    await projectsStore.createTasks(toRaw(projectsStore.projects[projectIndex]));
}

async function skipTask(taskId: Task['id']) {
    const taskIndex = projectsStore.projects[projectIndex].tasks.findIndex(task => task.id === taskId);
    projectsStore.projects[projectIndex].tasks[taskIndex].skip = !projectsStore.projects[projectIndex].tasks[taskIndex].skip;

    // Reset task updatedAt
    projectsStore.projects[projectIndex].tasks[taskIndex].updatedAt = new Date();

    // Save Project File
    await projectsStore.saveProject(toRaw(projectsStore.projects[projectIndex]), false);
}

async function deleteTask(task: Task, saveProject = true) {
    await projectsStore.deleteTask(toRaw(task), saveProject);
}

async function buildAv1anArgs(taskOrId: Task['id'] | Task) {
    const task = typeof taskOrId === 'string' ? projectsStore.projects[projectIndex].tasks.find(task => task.id === taskOrId) : taskOrId;
    if (!task) {
        return;
    }

    const builtOptions = projectsStore.buildTaskAv1anOptions(toRaw(task));
    if (!builtOptions) {
        return;
    }

    return window.projectsApi['build-task-av1an-arguments'](builtOptions);
}

async function processQueue(currentTask: Task) {
    if (['cancelled'].includes(projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id].status)) {
        return;
    }

    const taskOptions = projectsStore.buildTaskAv1anOptions(currentTask);
    if (!taskOptions) {
        projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id] = {
            taskId: currentTask.id,
            status: 'error',
        };

        return;
    }

    // Start or resume next task
    projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id] = {
        taskId: currentTask.id,
        status: 'processing',
    };
    await window.projectsApi['start-task'](toRaw(currentTask), taskOptions);

    // Check if queue status has changed (cancelled, paused, error)
    if (projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id].status !== 'processing') {
        return;
    }

    projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id] = {
        taskId: currentTask.id,
        status: 'idle',
    };

    const queueTaskIndex = projectsStore.projects[projectIndex].tasks.filter(task => !task.skip).findIndex(task => task.id === currentTask.id);
    const remainingTasks = projectsStore.projects[projectIndex].tasks.filter(task => !task.skip).slice(queueTaskIndex + 1);
    const nextTask = remainingTasks.find(task => ['idle', 'paused', 'cancelled'].includes(task.statusHistory.length ? task.statusHistory[task.statusHistory.length - 1].state : 'idle'));

    if (!nextTask) {
        // Nothing to process
        projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id] = {
            // taskId: currentTask.id,
            status: 'done',
        };

        return;
    }

    await processQueue(nextTask);
}

async function cancelTask() {
    if (projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id].status !== 'processing') {
        return;
    }

    const task = projectsStore.projects[projectIndex].tasks.find(task => task.id === projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id].taskId);

    if (!task) {
        return;
    }

    await window.projectsApi['cancel-task'](toRaw(task));
    // projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id].status = 'cancelled';
    projectsStore.projectQueueMap[projectsStore.projects[projectIndex].id] = {
        status: 'idle',
    };
}

// #endregion Task Lifecycle

async function copyToClipboard(text: string) {
    await window.configurationsApi['copy-to-clipboard'](text);
}

</script>

<template>
    <NCard>
        <template #header>
            <NFlex>
                <NText>
                    Task Queue
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
                            @click="addTask"
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
                    Add Tasks
                </NTooltip>
            </NFlex>
        </template>
        <template #header-extra>
            <NButtonGroup>
                <NTooltip
                    v-if="projectQueueMap[projects[projectIndex].id].status !== 'processing'"
                    :delay="500"
                    placement="left"
                    :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                >
                    <template #trigger>
                        <NButton
                            size="small"
                            tertiary
                            type="success"
                            @click="async () => {
                                if (projectQueueMap[projects[projectIndex].id].status === 'processing') {
                                    return;
                                }
        
                                // Get first/next task
                                const queueTaskIndex = projectQueueMap[projects[projectIndex].id].taskId ? projects[projectIndex].tasks.findIndex(task => task.id === projectQueueMap[projects[projectIndex].id].taskId) : -1;
                                const remainingTasks = projects[projectIndex].tasks.slice(queueTaskIndex > -1 ? queueTaskIndex : 0).filter(task => !task.skip);
                                const nextTask = remainingTasks.find(task => ['idle', 'paused', 'cancelled'].includes(task.statusHistory.length ? task.statusHistory[task.statusHistory.length - 1].state : 'idle'));
        
                                if (!nextTask) {
                                    // Nothing to process
                                    projectsStore.projectQueueMap[projects[projectIndex].id] = {
                                        ...(projectsStore.projectQueueMap[projects[projectIndex].id] ?? {}),
                                        status: 'done',
                                    };
        
                                    return;
                                }
        
                                await processQueue(nextTask);
                            }"
                        >
                            <template #icon>
                                <NIcon>
                                    <StartIcon />
                                </NIcon>
                            </template>
                        </NButton>
                    </template>
                    Start
                </NTooltip>
                <NTooltip
                    v-else-if="projectQueueMap[projects[projectIndex].id].status === 'processing'"
                    :delay="500"
                    placement="left"
                    :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                >
                    <template #trigger>
                        <NButton
                            size="small"
                            tertiary
                            type="error"
                            @click="cancelTask"
                        >
                            <template #icon>
                                <NIcon>
                                    <StopIcon />
                                </NIcon>
                            </template>
                        </NButton>
                    </template>
                    Stop
                </NTooltip>
            </NButtonGroup>
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
            <!-- TODO: Update Project after every sort event -->
            <VueDraggable
                v-model="projects[projectIndex].tasks"
                :delay="200"
                :delay-on-touch-only="true"
                @end="(event) => {
                    // choose, unchoose, start, end, add, update, sort, remove, filter, move, clone, change
                    console.log('SORTABLE EVENT:', event);
                    // SortableJS workaround: toRaw tasks which become proxies when moved/sorted
                    projects[projectIndex].tasks = projects[projectIndex].tasks.map(task => toRaw(task));
                }"
            >
                <NCard
                    v-for="task in projects[projectIndex].tasks"
                    :key="task.id"
                    hoverable
                    :style="{ opacity: task.skip ? 0.5 : 1 }"
                >
                    <template #header>
                        <RouterLink
                            :style="{ textDecoration: 'none' }"
                            :to="`/projects/${projects[projectIndex].id}/tasks/${task.id}`"
                        >
                            <NTooltip
                                :delay="500"
                                placement="top-start"
                                :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                            >
                                <template #trigger>
                                    <NText>{{ task.outputFileName }}</NText>
                                </template>
                                {{ task.id }}
                            </NTooltip>
                        </RouterLink>
                    </template>
                    <template #header-extra>
                        <NButtonGroup>
                            <NTooltip
                                :delay="500"
                                :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                            >
                                <template #trigger>
                                    <NButton
                                        size="small"
                                        tertiary
                                        :disabled="projectQueueMap[projects[projectIndex].id].status === 'processing' && projectQueueMap[projects[projectIndex].id].taskId === task.id"
                                        @click="skipTask(task.id)"
                                    >
                                        <template #icon>
                                            <NIcon>
                                                <CheckboxIndeterminate
                                                    v-if="task.skip"
                                                />
                                                <CheckboxChecked
                                                    v-else
                                                />
                                            </NIcon>
                                        </template>
                                    </NButton>
                                </template>
                                {{ task.skip ? 'Unskip' : 'Skip' }}
                            </NTooltip>
                            <NTooltip
                                :delay="500"
                                :style="{ padding: '10px', paddingTop: '2px', paddingBottom: '2px' }"
                            >
                                <template #trigger>
                                    <NButton
                                        type="error"
                                        size="small"
                                        tertiary
                                        :disabled="projectQueueMap[projects[projectIndex].id].status === 'processing' && projectQueueMap[projects[projectIndex].id].taskId === task.id"
                                        @click="() => deleteTask(task)"
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
                        <NDropdown
                            trigger="click"
                            :options="generateTaskDropdownOptions(task)"
                            @select="(key) => handleTaskDropdownSelect(task, key)"
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
                        :project-id="projects[projectIndex].id"
                        :task-id="task.id"
                    />
                <!-- TODO: Add ETA (Optional: Allow click to change between also showing FPS and X/FramesCount) -->
                </NCard>
            </VueDraggable>
        </NFlex>
    </NCard>
    <NModal
        v-model:show="showBatchAv1anCommandModal"
        preset="card"
        title="Av1an Command"
        :style="{ width: '65%', height: '65%' }"
    >
        <template #header-extra>
            <NButton
                size="small"
                secondary
                @click="() => {
                    showAv1anPrintFriendlyCommand = !showAv1anPrintFriendlyCommand;
                }"
            >
                Show {{ showAv1anPrintFriendlyCommand ? 'Unquoted' : 'Console-Friendly' }} Commands
            </NButton>
        </template>
        <NInput
            :value="showAv1anPrintFriendlyCommand ? batchAv1anCommand.printFriendlyBatchCommand : batchAv1anCommand.batchCommand"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 12 }"
            readonly
        >
            <template #suffix>
                <NButton
                    text
                    @click="copyToClipboard(showAv1anPrintFriendlyCommand ? batchAv1anCommand.printFriendlyBatchCommand : batchAv1anCommand.batchCommand)"
                >
                    <NTooltip>
                        <template #trigger>
                            <NIcon
                                :component="CopyIcon"
                            />
                        </template>
                        Copy
                    </NTooltip>
                </NButton>
            </template>
        </NInput>
    </NModal>
</template>