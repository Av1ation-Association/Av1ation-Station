<script setup lang="ts">
import { RouterLink, onBeforeRouteUpdate, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
    NCard,
    NFlex,
    NLayout,
    NPopover,
    NText,
    NTime,
    NTimeline,
    NTimelineItem,
} from 'naive-ui';
import { useProjectsStore } from '../stores/projects';
import { type Av1anStatus } from '../../../main/src/utils/Av1an/Av1an';
import ProjectBreadcrumb from '../components/ProjectBreadcrumb.vue';
import { type Task } from '../../../main/src/data/Configuration/Projects';
import { toRaw } from 'vue';

const router = useRouter();

const projectsStore = useProjectsStore();
const { projects, projectQueueMap } = storeToRefs(projectsStore);

// Redirect if no task or project id
onBeforeRouteUpdate((to, _from) => {
    if (!to.params.taskId) {
        if (!to.params.projectId) {
            router.push('/');
        } else {
            router.push(`/projects/${to.params.projectId}`);
        }
    }
});

// Get project id from route
const { projectId, taskId } = router.currentRoute.value.params;

const projectIndex = projectsStore.projects.findIndex((project) => project.id === projectId);

if (projectIndex === -1) {
    router.push('/');
}

const taskIndex = projectsStore.projects[projectIndex].tasks.findIndex((task) => task.id === taskId);

if (taskIndex === -1) {
    router.push('/projects/' + projectId);
}

function generateProgressGroups() {
    // create groups of status changes
    return projectsStore.projects[projectIndex].tasks[taskIndex].statusHistory
        .map(event => {
            const { time, ...eventRest } = event;
            return {
                ...eventRest,
                time: new Date(time),
            };
        })
        .reduce((groups, event, index) => {
            const nextEvent = index < projectsStore.projects[projectIndex].tasks[taskIndex].statusHistory.length - 1 ? projectsStore.projects[projectIndex].tasks[taskIndex].statusHistory[index + 1] : undefined;
            // Add event to last group
            groups[groups.length - 1].push(event);

            switch (event.state) {
                case 'done':
                case 'cancelled':
                case 'error': {
                    if (nextEvent) {
                        // Start new Progress Group
                        groups.push([]);
                    }
                            
                    break;
                }
                case 'scene-detection':
                case 'encoding': {
                    if (nextEvent && nextEvent.state === 'idle') {
                    // Start new Progress Group
                        groups.push([]);
                    }
                }
            }

            return groups;
        }, [[]] as Av1anStatus[][]);
}

function progressETA(task: Task) {
    return projectsStore.taskProgressETA(toRaw(task))?.toLocaleString() ?? (new Date()).toLocaleString();
}

function totalEncodeTime(groups?: Av1anStatus[][]) {
    return (groups ?? generateProgressGroups())
        .filter(group => group.some(event => event.state === 'encoding'))
        .map(group => {
            return (new Date(group[group.length - 1].time).getTime()) - (new Date((group[0].state === 'encoding' ? group[0] : group[1]).time).getTime());
        })
        .reduce((totalTime, groupTotalTime) => totalTime + groupTotalTime, 0);
}

</script>

<template>
    <!-- TODO: Add header for queue statistics -->
    <NLayout
        content-style="padding: 24px;"
        :native-scrollbar="false"
    >
        <NFlex
            vertical
        >
            <ProjectBreadcrumb
                :project-id="projects[projectIndex].id"
                :task-id="projects[projectIndex].tasks[taskIndex].id"
                :task-page="'status-history'"
            />
            <NCard
                :title="`${projects[projectIndex].tasks[taskIndex].outputFileName} Progress History`"
            >
                <NTimeline
                    size="large"
                >
                    <template
                        v-for="(group, index) in generateProgressGroups()"
                        :key="index"
                    >
                        <template
                            v-if="group[group.length - 1].state === 'idle'"
                        >
                            <NTimelineItem
                                title="Initialized"
                                :time="group[0].time.toLocaleString()"
                            >
                                <template #footer>
                                    <NPopover
                                        trigger="hover"
                                        placement="right"
                                    >
                                        <template #trigger>
                                            <NTime
                                                :time="new Date(group[0].time)"
                                                :to="new Date()"
                                                type="relative"
                                            />
                                        </template>
                                        <NTime
                                            :time="new Date(group[0].time)"
                                        />
                                    </NPopover>
                                </template>
                            </NTimelineItem>
                        </template>
                        <template
                            v-else-if="group[group.length - 1].state === 'scene-detection'"
                        >
                            <NTimelineItem
                                v-if="group.length > 1"
                                title="Initialized"
                            >
                                <template #footer>
                                    <NPopover
                                        trigger="hover"
                                        placement="right"
                                    >
                                        <template #trigger>
                                            <NTime
                                                :time="new Date(group[0].time)"
                                                :to="new Date()"
                                                type="relative"
                                            />
                                        </template>
                                        <NTime
                                            :time="new Date(group[0].time)"
                                        />
                                    </NPopover>
                                </template>
                            </NTimelineItem>
                            <NTimelineItem
                                type="info"
                                title="Scene Detection Started"
                                :time="group[group.length > 1 ? 1 : 0].time.toLocaleString()"
                            >
                                <template #footer>
                                    <NPopover
                                        trigger="hover"
                                        placement="right"
                                    >
                                        <template #trigger>
                                            <NTime
                                                :time="new Date(group[group.length > 1 ? 1 : 0].time)"
                                                :to="new Date()"
                                                type="relative"
                                            />
                                        </template>
                                        <NTime
                                            :time="new Date(group[group.length > 1 ? 1 : 0].time)"
                                        />
                                    </NPopover>
                                </template>
                            </NTimelineItem>
                        </template>
                        <template
                            v-else-if="group[group.length - 1].state === 'encoding'"
                        >
                            <NTimelineItem
                                type="info"
                                title="Encode Started"
                                :line-type="index === (generateProgressGroups().length - 1) && projectQueueMap[projects[projectIndex].id].status === 'processing' && projectQueueMap[projects[projectIndex].id].taskId === projects[projectIndex].tasks[taskIndex].id ? 'dashed' : undefined"
                            >
                                <template #footer>
                                    <NPopover
                                        trigger="hover"
                                        placement="right"
                                    >
                                        <template #trigger>
                                            <NTime
                                                :time="new Date((group[0].state === 'encoding' ? group[0] : group[1]).time)"
                                                :to="new Date()"
                                                type="relative"
                                            />
                                        </template>
                                        <NTime
                                            :time="new Date((group[0].state === 'encoding' ? group[0] : group[1]).time)"
                                        />
                                    </NPopover>
                                </template>
                            </NTimelineItem>
                            <NTimelineItem
                                v-if="index !== (generateProgressGroups().length - 1) || projectQueueMap[projects[projectIndex].id].status !== 'processing' || projectQueueMap[projects[projectIndex].id].taskId !== projects[projectIndex].tasks[taskIndex].id"
                                type="warning"
                                title="Encode Stopped"
                            >
                                <template #default>
                                    Encoded {{ group.reduce((total, event) => total + (event.state === 'encoding' ? event.progress?.chunk.framesCompleted ?? 0 : 0), 0) }}/{{ projects[projectIndex].tasks[taskIndex].totalFrames }}
                                    <NTime
                                        :time="new Date(group[group.length - 1].time)"
                                        :to="new Date((group[0].state === 'encoding' ? group[0] : group[1]).time)"
                                        type="relative"
                                    />
                                    ({{ (group.filter(event => event.state === 'encoding' && event.progress).reduce((total, event) => total + (event.progress?.chunk.framesCompleted ?? 0), 0) / (totalEncodeTime([group]) / 1000)).toFixed(2) }} fps)
                                </template>
                                <template #footer>
                                    <NPopover
                                        trigger="hover"
                                        placement="right"
                                    >
                                        <template #trigger>
                                            <NTime
                                                :time="new Date(group[group.length - 1].time)"
                                                :to="new Date()"
                                                type="relative"
                                            />
                                        </template>
                                        <NTime
                                            :time="new Date(group[group.length - 1].time)"
                                        />
                                    </NPopover>
                                </template>
                            </NTimelineItem>
                            <NTimelineItem
                                v-else
                                type="success"
                                title="Encode Completed"
                            >
                                <template #footer>
                                    <NPopover
                                        trigger="hover"
                                        placement="right"
                                    >
                                        <template #trigger>
                                            <NTime
                                                :time="new Date()"
                                                :to="new Date(progressETA(projects[projectIndex].tasks[taskIndex]))"
                                                type="relative"
                                            />
                                        </template>
                                        <NTime
                                            :time="new Date(progressETA(projects[projectIndex].tasks[taskIndex]))"
                                        />
                                    </NPopover>
                                </template>
                            </NTimelineItem>
                        </template>
                        <template
                            v-else-if="group[group.length - 1].state === 'cancelled'"
                        >
                            <template
                                v-if="group.length > 1 && group[group.length - 2].state === 'scene-detection'"
                            >
                                <NTimelineItem
                                    v-if="group[0].state === 'idle'"
                                    title="Initialized"
                                >
                                    <template #footer>
                                        <NPopover
                                            trigger="hover"
                                            placement="right"
                                        >
                                            <template #trigger>
                                                <NTime
                                                    :time="new Date(group[0].time)"
                                                    :to="new Date()"
                                                    type="relative"
                                                />
                                            </template>
                                            <NTime
                                                :time="new Date(group[0].time)"
                                            />
                                        </NPopover>
                                    </template>
                                </NTimelineItem>
                                <NTimelineItem
                                    type="info"
                                    title="Scene Detection Started"
                                >
                                    <template #footer>
                                        <NPopover
                                            trigger="hover"
                                            placement="right"
                                        >
                                            <template #trigger>
                                                <NTime
                                                    :time="new Date(group[group.length - 2].time)"
                                                    :to="new Date()"
                                                    type="relative"
                                                />
                                            </template>
                                            <NTime
                                                :time="new Date(group[group.length - 2].time)"
                                            />
                                        </NPopover>
                                    </template>
                                </NTimelineItem>
                                <NTimelineItem
                                    type="warning"
                                    title="Scene Detection Stopped"
                                >
                                    <template #footer>
                                        <NPopover
                                            trigger="hover"
                                            placement="right"
                                        >
                                            <template #trigger>
                                                <NTime
                                                    :time="new Date(group[group.length - 1].time)"
                                                    :to="new Date()"
                                                    type="relative"
                                                />
                                            </template>
                                            <NTime
                                                :time="new Date(group[group.length - 1].time)"
                                            />
                                        </NPopover>
                                    </template>
                                </NTimelineItem>
                            </template>
                            <template
                                v-else-if="group.length > 1 && group[group.length - 2].state === 'encoding'"
                            >
                                <NTimelineItem
                                    type="info"
                                    title="Encode Started"
                                >
                                    <template #footer>
                                        <NPopover
                                            trigger="hover"
                                            placement="right"
                                        >
                                            <template #trigger>
                                                <NTime
                                                    :time="new Date((group[0].state === 'encoding' ? group[0] : group[1]).time)"
                                                    :to="new Date()"
                                                    type="relative"
                                                />
                                            </template>
                                            <NTime
                                                :time="new Date((group[0].state === 'encoding' ? group[0] : group[1]).time)"
                                            />
                                        </NPopover>
                                    </template>
                                </NTimelineItem>
                                <NTimelineItem
                                    type="warning"
                                    title="Encode Stopped"
                                >
                                    <template #default>
                                        Encoded {{ group.reduce((total, event) => total + (event.state === 'encoding' ? event.progress?.chunk.framesCompleted ?? 0 : 0), 0) }}/{{ projects[projectIndex].tasks[taskIndex].totalFrames }} frames
                                        <NTime
                                            :time="new Date(group[group.length - 1].time)"
                                            :to="new Date((group[0].state === 'encoding' ? group[0] : group[1]).time)"
                                            type="relative"
                                        />
                                        ({{ (group.filter(event => event.state === 'encoding' && event.progress).reduce((total, event) => total + (event.progress?.chunk.framesCompleted ?? 0), 0) / (totalEncodeTime([group]) / 1000)).toFixed(2) }} fps)
                                    </template>
                                    <template #footer>
                                        <NPopover
                                            trigger="hover"
                                            placement="right"
                                        >
                                            <template #trigger>
                                                <NTime
                                                    :time="new Date(group[group.length - 1].time)"
                                                    :to="new Date()"
                                                    type="relative"
                                                />
                                            </template>
                                            <NTime
                                                :time="new Date(group[group.length - 1].time)"
                                            />
                                        </NPopover>
                                    </template>
                                </NTimelineItem>
                            </template>
                        </template>
                        <template
                            v-else-if="group[group.length - 1].state === 'error'"
                        >
                            <NTimelineItem
                                type="error"
                                title="Error"
                                :time="group[group.length - 1].time.toLocaleString()"
                            >
                                <template #default>
                                    <RouterLink
                                        style="text-decoration: none;"
                                        :to="`/projects/${projects[projectIndex].id}/tasks/${projects[projectIndex].tasks[taskIndex].id}/av1an-logs`"
                                    >
                                        <NText>Review Av1an Logs</NText>
                                    </RouterLink>
                                </template>
                                <template #footer>
                                    <NPopover
                                        trigger="hover"
                                        placement="right"
                                    >
                                        <template #trigger>
                                            <NTime
                                                :time="new Date(group[group.length - 1].time)"
                                                :to="new Date()"
                                                type="relative"
                                            />
                                        </template>
                                        <NTime
                                            :time="new Date(group[group.length - 1].time)"
                                        />
                                    </NPopover>
                                </template>
                            </NTimelineItem>
                        </template>
                        <template
                            v-else-if="group[group.length - 1].state === 'done'"
                        >
                            <NTimelineItem
                                type="info"
                                title="Encode Started"
                            >
                                <template #footer>
                                    <NPopover
                                        trigger="hover"
                                        placement="right"
                                    >
                                        <template #trigger>
                                            <NTime
                                                :time="new Date(group[1].time)"
                                                :to="new Date()"
                                                type="relative"
                                            />
                                        </template>
                                        <NTime
                                            :time="new Date(group[1].time)"
                                        />
                                    </NPopover>
                                </template>
                            </NTimelineItem>
                            <NTimelineItem
                                type="success"
                                title="Encode Completed"
                                :time="group[group.length - 1].time.toLocaleString()"
                            >
                                <template #default>
                                    Encoded {{ projects[projectIndex].tasks[taskIndex].totalFrames }} frames
                                    <NTime
                                        :time="new Date(totalEncodeTime())"
                                        :to="new Date(0)"
                                        type="relative"
                                    />
                                    ({{ (projects[projectIndex].tasks[taskIndex].totalFrames / (totalEncodeTime() / 1000)).toFixed(2) }} fps)
                                </template>
                                <template #footer>
                                    <NPopover
                                        trigger="hover"
                                        placement="right"
                                    >
                                        <template #trigger>
                                            <NTime
                                                :time="new Date(group[group.length - 1].time)"
                                                :to="new Date()"
                                                type="relative"
                                            />
                                        </template>
                                        <NTime
                                            :time="new Date(group[group.length - 1].time)"
                                        />
                                    </NPopover>
                                </template>
                            </NTimelineItem>
                        </template>
                    </template>
                </NTimeline>
            </NCard>
        </NFlex>
    </NLayout>
</template>
