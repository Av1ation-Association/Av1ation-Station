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
    NProgress,
    NText,
    NTime,
    NTag,
    NTooltip,
} from 'naive-ui';
import {
    Add,
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
    await projectsStore.registerTaskStatusListener();
}

async function addTask() {
    // Import video or vapoursynth script from file dialog
    await projectsStore.createTasks(project);
}

async function skipTask(taskId: Task['id']) {
    const taskIndex = project.tasks.findIndex(task => task.id === taskId);
    project.tasks[taskIndex].skip = !project.tasks[taskIndex].skip;

    // Reset task updatedAt
    project.tasks[taskIndex].updatedAt = new Date();

    // Save Project File
    await projectsStore.saveProject(toRaw(project), false);
}

async function deleteTask(taskId: Task['id']) {
    // TODO: Check if task is in progress (Prompt user to cancel the task if it is)
    const taskIndex = project.tasks.findIndex(task => task.id === taskId);    
    if (taskIndex === -1) {
        return;
    }

    // Delete temporary files
    await window.projectsApi['task-delete-temporary-files'](toRaw(project.tasks[taskIndex]));
    // Remove task
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
    if (['cancelled'].includes(projectsStore.projectQueueMap[project.id].status)) {
        return;
    }

    const taskOptions = buildTaskAv1anOptions(currentTask);
    // Start or resume next task
    projectsStore.projectQueueMap[project.id] = {
        taskId: currentTask.id,
        status: 'processing',
    };
    await window.projectsApi['start-task'](toRaw(currentTask), taskOptions);

    // Check if queue status has changed (cancelled, paused, error)
    if (projectsStore.projectQueueMap[project.id].status !== 'processing') {
        return;
    }

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
    // projectsStore.projectQueueMap[project.id].status = 'cancelled';
    projectsStore.projectQueueMap[project.id] = {
        status: 'idle',
    };
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

    if (!lastStatus) {
        return 'default';
    }

    switch (lastStatus.state) {
        case 'done':
            return 'success';
        case 'cancelled':
            return 'warning';
        case 'error':
            return 'error'; 
        case 'idle':
            return 'info';
        case 'scene-detection':
        case 'encoding':
        default:
            return 'default';
    }
}

function progressPercentage(task: Task) {
    const totalFramesCompleted = [...task.statusHistory].reverse().find(status => status.progress)?.progress?.framesCompleted ?? 0;

    return (totalFramesCompleted / (task.totalFrames || 1)) * 100;
}

function lastStatusProgress(task: Task) {
    return [...task.statusHistory].reverse().find(status => status.progress);
}

function progressEstimatedSeconds(task: Task) {
    const lastStatus = [...task.statusHistory].reverse().find(status => status.progress);
    
    if (!lastStatus || !lastStatus.progress) {
        return;
    }

    return lastStatus.progress.estimatedSeconds;
}

function progressETA(task: Task) {
    const estimatedSeconds = progressEstimatedSeconds(task);

    if (!estimatedSeconds) {
        return;
    }

    return new Date(Date.now() + (estimatedSeconds * 1000));
}

function progressEstimatedSize(task: Task) {
    const lastStatus = [...task.statusHistory].reverse().find(status => status.progress);

    if (!lastStatus || !lastStatus.progress) {
        return;
    }

    return formatBytes(lastStatus.progress.estimatedSizeInBytes);
}

// Thanks to Pawel Zentala: https://gist.github.com/zentala/1e6f72438796d74531803cc3833c039c
function formatBytes(bytes: number, decimals = 2) {
    if (bytes == 0) return '0 Bytes';
    const k = 1024,
        sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
        i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

async function revealFileLocation() {
    await window.configurationsApi['show-file'](`${project.path}`);
}

</script>

<template>
    <NCard>
        <template #header>
            <NFlex>
                <NText>
                    Task Queue
                </NText>
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
                    Add
                </NButton>
            </NFlex>
        </template>
        <template #header-extra>
            <NButtonGroup>
                <NButton
                    v-if="projectQueueMap[project.id].status !== 'processing'"
                    @click="async () => {
                        if (projectQueueMap[project.id].status === 'processing') {
                            return;
                        }

                        // Get first/next task
                        const queueTaskIndex = projectQueueMap[project.id].taskId ? project.tasks.findIndex(task => task.id === projectQueueMap[project.id].taskId) : -1;
                        const remainingTasks = project.tasks.slice(queueTaskIndex > -1 ? queueTaskIndex : 0).filter(task => !task.skip);
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
                v-model="project.tasks"
                :delay="200"
                :delay-on-touch-only="true"
                @end="(event) => {
                    // choose, unchoose, start, end, add, update, sort, remove, filter, move, clone, change
                    console.log('SORTABLE EVENT:', event);
                    // SortableJS workaround: toRaw tasks which become proxies when moved/sorted
                    project.tasks = project.tasks.map(task => toRaw(task));
                }"
            >
                <NCard
                    v-for="task in project.tasks"
                    :key="task.id"
                    :name="task.id"
                    :title="task.outputFileName"
                    hoverable
                    :style="{ opacity: task.skip ? 0.5 : 1 }"
                >
                    <template #header-extra>
                        <NButtonGroup>
                            <NButton
                                size="small"
                                ghost
                                @click="skipTask(task.id)"
                            >
                                <template #icon>
                                    <NIcon>
                                        <Checkbox
                                            v-if="task.skip"
                                        />
                                        <CheckboxChecked
                                            v-else
                                        />
                                    </NIcon>
                                </template>
                            </NButton>
                            <NButton
                                size="small"
                                @click="() => {
                                    router.push(`/projects/${project.id}/tasks/${task.id}`);
                                }"
                            >
                                View
                            </NButton>
                            <NButton
                                type="error"
                                size="small"
                                ghost
                                @click="() => deleteTask(task.id)"
                            >
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
                    <NFlex
                        :wrap="false"
                    >
                        <NProgress
                            type="line"
                            :status="progressStatus(task)"
                            :percentage="progressPercentage(task)"
                            indicator-placement="inside"
                            :processing="['encoding', 'scene-detection'].includes((task.statusHistory.length ? task.statusHistory[task.statusHistory.length - 1].state : 'idle'))"
                            :height="['encoding', 'scene-detection', 'paused', 'cancelled'].includes((task.statusHistory.length ? task.statusHistory[task.statusHistory.length - 1].state : 'idle')) ? 22 : 10"
                        >
                            <template
                                v-if="task.statusHistory.length && task.statusHistory[task.statusHistory.length - 1].state === 'scene-detection'"
                            >
                                Detecting Scenes...
                            </template>
                            <template
                                v-else-if="task.statusHistory.length && ['encoding', 'paused', 'cancelled'].includes(task.statusHistory[task.statusHistory.length - 1].state)"
                            >
                                {{ progressPercentage(task).toFixed(2) }}%
                            </template>
                        </NProgress>
                        <template
                            v-if="['encoding', 'scene-detection', 'paused'].includes((task.statusHistory.length ? task.statusHistory[task.statusHistory.length - 1].state : 'idle'))"
                        >
                            <template
                                v-if="progressEstimatedSize(task)"
                            >
                                <NTooltip>
                                    <template #trigger>
                                        <NTag
                                            round
                                            :bordered="false"
                                            size="small"
                                        >
                                            <NTime
                                                type="relative"
                                                :time="progressETA(task)?.getTime()"
                                                :to="Date.now()"
                                            />
                                        </NTag>
                                    </template>
                                    {{ (progressEstimatedSeconds(task) ?? 0).toFixed(0) }} seconds left
                                </NTooltip>
                            </template>
                            <template
                                v-if="progressEstimatedSize(task)"
                            >
                                <NTooltip>
                                    <template #trigger>
                                        <NTag
                                            round
                                            :bordered="false"
                                            size="small"
                                        >
                                            {{ progressEstimatedSize(task) }}
                                        </NTag>
                                    </template>
                                    {{ ((lastStatusProgress(task)?.progress?.bitrate ?? 0) / 1000).toFixed(2) }} kbps
                                </NTooltip>
                            </template>
                        </template>
                        <template
                            v-else-if="['done'].includes((task.statusHistory.length ? task.statusHistory[task.statusHistory.length - 1].state : 'idle'))"
                        >
                            <NTooltip>
                                <template #trigger>
                                    <NTag
                                        round
                                        :bordered="false"
                                        size="small"
                                    >
                                        <NTime
                                            type="relative"
                                            :time="(new Date(task.statusHistory[task.statusHistory.length - 1].time)).getTime()"
                                            :to="Date.now()"
                                        />
                                    </NTag>
                                </template>
                                <NTime
                                    :time="(new Date(task.statusHistory[task.statusHistory.length - 1].time)).getTime()"
                                />
                            </NTooltip>
                        </template>
                    </NFlex>
                <!-- TODO: Add ETA (Optional: Allow click to change between also showing FPS and X/FramesCount) -->
                </NCard>
            </VueDraggable>
        </NFlex>
    </NCard>
</template>