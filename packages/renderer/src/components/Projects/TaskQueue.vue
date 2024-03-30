<script setup lang="ts">
import { h, toRaw } from 'vue';
import { useRouter } from 'vue-router';
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
    // NTime,
    // NDescriptions,
    // NDescriptionsItem,
    // NInput,
    // NPopover,
    NProgress,
    // NTooltip,
} from 'naive-ui';
import {
    VolumeFileStorage as RevealIcon,
    TrashCan as DeleteIcon,
    Copy as DuplicateIcon,
    OverflowMenuVertical,
    // TagEdit as EditNameIcon,
    Checkbox,
    CheckboxChecked,
} from '@vicons/carbon';
import {
    type Task,
    // type Project,
} from '../../../../main/src/data/Configuration/Projects';
import { useGlobalStore } from '../../stores/global';
import { useProjectsStore } from '../../stores/projects';
import { type Av1anStatus } from '../../../../main/src/utils/Av1an/Av1an';

const router = useRouter();

const configStore = useGlobalStore();
const projectsStore = useProjectsStore();
const { projectQueueMap } = storeToRefs(projectsStore);

const { projectId } = defineProps<{
    projectId: string;
}>();

const projectIndex = projectsStore.projects.findIndex(project => project.id === projectId);
const project = projectsStore.projects[projectIndex];

// #region Dropdown
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

// #endregion

// #region Task Lifecycle

// Register Task Status Listener
if (!projectsStore.taskStatusListenerRegistered) {
    // Set up Task Status Listener
    window.projectsApi['task-status'](async (status) => {
        const task = project.tasks.find(task => task.id === status.taskId);
    
        if (!task) {
            return;
        }

        if ((status.status as Av1anStatus).state === 'encoding') {
            // Update task frame count
            if (!task.totalFrames) {
                const frameCount = await window.projectsApi['task-av1an-frame-count'](toRaw(task));
                if (frameCount) {
                    task.totalFrames = frameCount;
                }
            }
        }
        task.statusHistory.push(status.status);
        console.log('STATUS HISTORY: ', task.statusHistory);
    });

    projectsStore.taskStatusListenerRegistered = true;
}


async function createTask() {
    // Import video or vapoursynth script from file dialog
    await projectsStore.createTasks(project);
}

async function skipTask(taskId: Task['id']) {
    const taskIndex = project.tasks.findIndex(task => task.id === taskId);
    project.tasks[taskIndex].skip = !project.tasks[taskIndex].skip;

    // Reset task updatedAt
    project.tasks[taskIndex].updatedAt = new Date();

    // SortableJS workaround: toRaw all tasks
    project.tasks = project.tasks.map(task => toRaw(task));
    // Save Project File
    await projectsStore.saveProject(toRaw(project), false);
}

async function deleteTask(taskId: Task['id']) {
    project.tasks.splice(project.tasks.findIndex(task => task.id === taskId), 1);

    // Save Project File
    await projectsStore.saveProject(toRaw(project));
}

async function buildAv1anArgs(taskId: Task['id']) {
    const task = project.tasks.find(task => task.id === taskId);
    if (!task) {
        return;
    }

    const builtOptions = buildTaskAv1anOptions(task);
    const args = await window.projectsApi['build-task-av1an-arguments'](builtOptions);

    console.log('COMMAND:', `av1an ${args.printFriendlyArguments.join(' ')}`);
}

async function processQueue(currentTask: Task) {
    if (['paused', 'cancelled'].includes(projectsStore.projectQueueMap[project.id].status)) {
        return;
    }

    const taskOptions = buildTaskAv1anOptions(currentTask);
    // Start or resume next task
    console.log('TASK:', toRaw(currentTask));
    console.log('TASK OPTIONS:', taskOptions);
    projectsStore.projectQueueMap[project.id] = {
        taskId: currentTask.id,
        status: 'processing',
    };
    await window.projectsApi['start-task'](toRaw(currentTask), taskOptions);

    projectsStore.projectQueueMap[project.id] = {
        taskId: currentTask.id,
        status: 'idle',
    };

    const queueTaskIndex = project.tasks.filter(task => !task.skip).findIndex(task => task.id === currentTask.id);
    const remainingTasks = project.tasks.filter(task => !task.skip).slice(queueTaskIndex + 1);
    const nextTask = remainingTasks.find(task => ['idle', 'paused', 'cancelled'].includes(task.statusHistory.length ? task.statusHistory[task.statusHistory.length - 1].state : 'idle'));

    if (!nextTask) {
        // Nothing to process
        projectsStore.projectQueueMap[project.id] = {
            taskId: currentTask.id,
            status: 'done',
        };
        console.log('QUEUE COMPLETE');

        return;
    }

    await processQueue(nextTask);
}

async function pauseTask() {
    if (projectsStore.projectQueueMap[project.id].status !== 'processing') {
        return;
    }

    const task = project.tasks.find(task => task.id === projectsStore.projectQueueMap[project.id].taskId);

    if (!task) {
        return;
    }

    await window.projectsApi['pause-task'](toRaw(task));
    projectsStore.projectQueueMap[project.id].status = 'paused';
}

async function cancelTask() {
    if (projectsStore.projectQueueMap[project.id].status !== 'processing') {
        return;
    }

    const task = project.tasks.find(task => task.id === projectsStore.projectQueueMap[project.id].taskId);

    if (!task) {
        return;
    }

    await window.projectsApi['cancel-task'](toRaw(task));
    projectsStore.projectQueueMap[project.id].status = 'cancelled';
}

// #endregion Task Lifecycle

function buildTaskAv1anOptions(task: Task) {
    // Build Task Av1an Options
    const {
        input: _configInput,
        output: _configOutput,
        temporary: _configTemporary,
        ...configDefaults
    } = configStore.config.defaults.Av1an;
    const {
        input: _projectInput,
        output: _projectOutput,
        temporary: _projectTemporary,
        ...projectDefaults
    } = project.defaults.Av1an;

    // Apply Av1an Defaults - Config -> Project -> Task
    function applyOptions(options: Task['item'], av1anCustom: Record<string, unknown>) {
        return Object.entries(av1anCustom).reduce((opts, [parameterName, parameterValue]) => {
            if (parameterValue === null) {
                delete (opts as Record<string, unknown>)[parameterName];
            } else if (typeof parameterValue === 'object') {
                if (!(parameterName in opts)) {
                    (opts as Record<string, unknown>)[parameterName] = {};
                }
                Object.entries(parameterValue).forEach(([subParameterName, subParameterValue]) => {
                    if (subParameterValue === null) {
                        delete ((opts as Record<string, unknown>)[parameterName] as Record<string, unknown>)[subParameterName];
                    } else {
                        ((opts as Record<string, unknown>)[parameterName] as Record<string, unknown>)[subParameterName] = toRaw(subParameterValue);
                    }
                });
            } else {
                (opts as Record<string, unknown>)[parameterName] = parameterValue;
            }
    
            return opts;
        }, options);
    }
    // Initial Av1an Options
    const configOptions: Task['item'] = {
        input: task.inputFileName,
        output: task.outputFileName,
        temporary: toRaw(task).item.temporary,
        ...configDefaults,
    };
    const configCustomOptions = applyOptions(configOptions, configStore.config.defaults.Av1anCustom);
    const projectOptions = applyOptions(configCustomOptions, projectDefaults);
    const projectCustomOptions = applyOptions(projectOptions, project.defaults.Av1anCustom);
    const taskOptions = applyOptions(projectCustomOptions, task.item);

    return taskOptions;
}

function progressStatus(task: Task): 'info' | 'success' | 'error' | 'default' | 'warning' {
    const lastStatus: Av1anStatus = task.statusHistory[task.statusHistory.length - 1];

    console.log('PROG - LAST STATUS: ', lastStatus);

    if (!lastStatus) {
        return 'default';
    }

    switch (lastStatus.state) {
        case 'done':
            return 'success';
        case 'canceled':
            return 'warning';
        case 'error':
            return 'error'; 
        case 'scene-detection':
        case 'encoding':
        default:
            return 'default';
    }
}

function progressPercentage(task: Task) {
    const totalFramesCompleted = task.statusHistory.reduce((total, status) => total + (status.framesCompleted ?? 0), 0);

    return (totalFramesCompleted / (task.totalFrames || 1)) * 100;
}

async function revealFileLocation() {
    await window.configurationsApi['show-file'](`${project.path}`);
}

</script>

<template>
    <NCard
        :title="`Task Queue`"
    >
        <template #header-extra>
            <NButtonGroup>
                <NButton
                    @click="createTask"
                >
                    Add
                </NButton>
                <NButton
                    v-if="projectQueueMap[project.id].status !== 'processing'"
                    @click="async () => {
                        if (projectQueueMap[project.id].status === 'processing') {
                            return;
                        }

                        // Get first/next task
                        const queueTaskIndex = projectQueueMap[project.id].taskId ? project.tasks.findIndex(task => task.id === projectQueueMap[project.id].taskId) : 0;
                        const remainingTasks = project.tasks.slice(queueTaskIndex).filter(task => !task.skip);
                        const nextTask = remainingTasks.find(task => ['idle', 'paused', 'cancelled'].includes(task.statusHistory.length ? task.statusHistory[task.statusHistory.length - 1].state : 'idle'));

                        if (!nextTask) {
                            // Nothing to process
                            projectsStore.projectQueueMap[project.id] = {
                                ...(projectsStore.projectQueueMap[project.id] ?? {}),
                                status: 'done',
                            };

                            return;
                        }

                        await processQueue(nextTask);
                    }"
                >
                    Start
                </NButton>
                <NButton
                    v-else-if="projectQueueMap[project.id].status === 'processing'"
                    @click="pauseTask"
                >
                    Pause
                </NButton>
                <NButton
                    @click="cancelTask"
                >
                    Cancel
                </NButton>
            </NButtonGroup>
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
            <!-- TODO: Update Project after every sort event -->
            <VueDraggable
                ref="el"
                v-model="project.tasks"
                @end="(event) => {
                    // choose, unchoose, start, end, add, update, sort, remove, filter, move, clone, change
                    console.log('SORTABLE EVENT:', event);
                }"
            >
                <NCard
                    v-for="task in project.tasks"
                    :key="task.id"
                    :name="task.id"
                    :title="task.outputFileName"
                >
                    <template #header-extra>
                        <NButtonGroup>
                            <NButton
                                size="small"
                                @click="router.push(`/encode/${task.id}`)"
                            >
                                View
                            </NButton>
                            <NButton
                                :type="task.skip ? 'warning' : 'default'"
                                size="small"
                                ghost
                                dashed
                                @click="skipTask(task.id)"
                            >
                                {{ task.skip ? 'Skipped' : 'Skip' }}
                                <template #icon>
                                    <NIcon>
                                        <Checkbox
                                            v-if="!task.skip"
                                        />
                                        <CheckboxChecked
                                            v-else
                                        />
                                    </NIcon>
                                </template>
                            </NButton>
                            <NButton
                                type="error"
                                size="small"
                                ghost
                                @click="() => deleteTask(task.id)"
                            >
                                Delete
                                <template #icon>
                                    <NIcon>
                                        <DeleteIcon />
                                    </NIcon>
                                </template>
                            </NButton>
                            <NButton
                                size="small"
                                @click="() => buildAv1anArgs(task.id)"
                            >
                                Av1an Args
                            </NButton>
                        </NButtonGroup>
                    </template>
                    <NProgress
                        type="line"
                        :status="progressStatus(task)"
                        :percentage="progressPercentage(task)"
                        indicator-placement="inside"
                        :processing="['encoding', 'scene-detection'].includes((task.statusHistory.length ? task.statusHistory[task.statusHistory.length - 1].state : 'idle'))"
                    >
                    <!-- TODO: Add ETA (Optional: Allow click to change between also showing FPS and X/FramesCount) -->
                    </NProgress>
                </NCard>
            </VueDraggable>
        </NFlex>
    </NCard>
</template>