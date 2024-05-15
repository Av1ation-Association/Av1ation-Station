<script setup lang="ts">
import { toRaw } from 'vue';
import { storeToRefs } from 'pinia';
import {
    NFlex,
    NProgress,
    NTag,
    NTime,
    NTooltip,
} from 'naive-ui';
import { type Project, type Task } from '../../../../main/src/data/Configuration/Projects';
import { useProjectsStore } from '../../stores/projects';

const projectsStore = useProjectsStore();
const { projects } = storeToRefs(projectsStore);

const { projectId, taskId } = defineProps<{
    projectId: Project['id'];
    taskId: Task['id'];
}>();

function getIndexes() {
    const projectIndex = projectsStore.projects.findIndex(project => project.id === projectId);
    const taskIndex = projectsStore.projects[projectIndex].tasks.findIndex(task => task.id === taskId);
    return {
        projectIndex,
        taskIndex,
    };
}

function progressStatus() {
    const { projectIndex, taskIndex } = getIndexes();
    return projectsStore.taskProgressStatus(toRaw(projectsStore.projects[projectIndex].tasks[taskIndex]));
}

function progressPercentage() {
    const { projectIndex, taskIndex } = getIndexes();
    return projectsStore.taskProgressPercentage(toRaw(projectsStore.projects[projectIndex].tasks[taskIndex]));
}

function lastStatusProgress() {
    const { projectIndex, taskIndex } = getIndexes();
    return [...toRaw(projectsStore.projects[projectIndex]).tasks[taskIndex].statusHistory].reverse().find(status => status.progress);
}

function progressEstimatedSeconds() {
    const { projectIndex, taskIndex } = getIndexes();
    return projectsStore.taskProgressEstimatedSeconds(toRaw(projectsStore.projects[projectIndex].tasks[taskIndex]));
}

function progressETA() {
    const { projectIndex, taskIndex } = getIndexes();
    return projectsStore.taskProgressETA(toRaw(projectsStore.projects[projectIndex].tasks[taskIndex]));
}

function progressEstimatedSize() {
    const { projectIndex, taskIndex } = getIndexes();
    const lastStatus = [...toRaw(projectsStore.projects[projectIndex].tasks[taskIndex]).statusHistory].reverse().find(status => status.progress);

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

</script>

<template>
    <NFlex
        :wrap="false"
    >
        <NProgress
            type="line"
            :status="progressStatus()"
            :percentage="progressPercentage()"
            indicator-placement="inside"
            :processing="['encoding', 'scene-detection'].includes((projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory.length ? projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory[projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory.length - 1].state : 'idle'))"
            :height="['encoding', 'scene-detection', 'paused', 'cancelled'].includes((projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory.length ? projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory[projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory.length - 1].state : 'idle')) ? 22 : 10"
        >
            <template
                v-if="projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory.length && projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory[projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory.length - 1].state === 'scene-detection'"
            >
                Detecting Scenes...
            </template>
            <template
                v-else-if="projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory.length && ['encoding', 'paused', 'cancelled'].includes(projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory[projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory.length - 1].state)"
            >
                {{ progressPercentage().toFixed(2) }}%
            </template>
        </NProgress>
        <template
            v-if="['encoding', 'scene-detection', 'paused', 'cancelled'].includes((projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory.length ? projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory[projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory.length - 1].state : 'idle'))"
        >
            <template
                v-if="progressEstimatedSize()"
            >
                <NTooltip
                    :delay="500"
                    :style="{ padding: '5px', paddingTop: '2px', paddingBottom: '2px' }"
                >
                    <template #trigger>
                        <NTag
                            round
                            :bordered="false"
                            size="small"
                        >
                            <NTime
                                type="relative"
                                :time="progressETA()?.getTime()"
                                :to="Date.now()"
                            />
                        </NTag>
                    </template>
                    {{ (progressEstimatedSeconds() ?? 0).toFixed(0) }} seconds left
                </NTooltip>
            </template>
            <template
                v-if="progressEstimatedSize()"
            >
                <NTooltip
                    :delay="500"
                    :style="{ padding: '5px', paddingTop: '2px', paddingBottom: '2px' }"
                >
                    <template #trigger>
                        <NTag
                            round
                            :bordered="false"
                            size="small"
                        >
                            {{ progressEstimatedSize() }}
                        </NTag>
                    </template>
                    {{ ((lastStatusProgress()?.progress?.bitrate ?? 0) / 1000).toFixed(2) }} kbps
                </NTooltip>
            </template>
        </template>
        <template
            v-else-if="['done'].includes((projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory.length ? projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory[projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory.length - 1].state : 'idle'))"
        >
            <NTooltip
                :delay="500"
                :style="{ padding: '5px', paddingTop: '2px', paddingBottom: '2px' }"
            >
                <template #trigger>
                    <NTag
                        round
                        :bordered="false"
                        size="small"
                    >
                        <NTime
                            type="relative"
                            :time="(new Date(projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory[projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory.length - 1].time)).getTime()"
                            :to="Date.now()"
                        />
                    </NTag>
                </template>
                <NTime
                    :time="(new Date(projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory[projects[getIndexes().projectIndex].tasks[getIndexes().taskIndex].statusHistory.length - 1].time)).getTime()"
                />
            </NTooltip>
            <NTooltip
                :delay="500"
                :style="{ padding: '5px', paddingTop: '2px', paddingBottom: '2px' }"
            >
                <template #trigger>
                    <NTag
                        round
                        :bordered="false"
                        size="small"
                    >
                        {{ progressEstimatedSize() }}
                    </NTag>
                </template>
                {{ ((lastStatusProgress()?.progress?.bitrate ?? 0) / 1000).toFixed(2) }} kbps
            </NTooltip>
        </template>
    </NFlex>
    <!-- TODO: Add ETA (Optional: Allow click to change between also showing FPS and X/FramesCount) -->
</template>