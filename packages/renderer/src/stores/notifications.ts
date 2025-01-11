import { defineStore } from 'pinia';
import {
    type Project,
    type Task,
} from '../../../shared/src/data/Projects';
import { useGlobalStore } from './global';
import { useProjectsStore } from './projects';

export enum NotificationType {
    TaskQueueStarted = 'Task Queue Started',
    TaskQueueCompleted = 'Task Queue Completed',
    TaskStarted = 'Task Started',
    TaskStopped = 'Task Stopped',
    TaskCompleted = 'Task Completed',
    TaskError = 'Task Error',
}

export interface Notification {
    id: number;
    title: NotificationType;
    time: Date;
    typeOverride?: 'default' | 'info' | 'success' | 'warning' | 'error';
    projectId?: Project['id'];
    taskId?: Task['id'];
}

export function NotificationTypeToTypeOverride(type: NotificationType): 'default' | 'info' | 'success' | 'warning' | 'error' {
    switch (type) {
        case NotificationType.TaskQueueStarted:
            return 'info';
        case NotificationType.TaskQueueCompleted:
            return 'success';
        case NotificationType.TaskStarted:
            return 'info';
        case NotificationType.TaskStopped:
            return 'warning';
        case NotificationType.TaskCompleted:
            return 'success';
        case NotificationType.TaskError:
            return 'error';
        default:
            return 'default';
    }
}

export function generateDescription(notification: Notification) {
    const projectsStore = useProjectsStore();

    const project = projectsStore.projects.find(project => project.id === notification.projectId);
    const projectName = project?.name ?? project?.id;
    const task = project?.tasks.find(task => task.id === notification.taskId);
    const taskName = task?.outputFileName ?? task?.id;

    switch (notification.title) {
        case NotificationType.TaskQueueStarted:
            return `Project ${projectName} Task Queue Started`;
        case NotificationType.TaskQueueCompleted:
            return `Project ${projectName} Task Queue Completed`;
        case NotificationType.TaskStarted:
            return `Project ${projectName} Task ${taskName} Started`;
        case NotificationType.TaskStopped:
            return `Project ${projectName} Task ${taskName} Stopped`;
        case NotificationType.TaskCompleted:
            return `Project ${projectName} Task ${taskName} Completed`;
        case NotificationType.TaskError:
            return `Project ${projectName} Task ${taskName} encountered an Error!`;
        default:
            return '';
    }
}

export const useNotificationsStore = defineStore('notifications', {
    state: () => {
        return {
            notifications: [] as (Notification & { id: number })[],
            notificationId: 0,
            notificationListener: undefined as ((notification: Notification) => void) | undefined,
        };
    },
    actions: {
        notify(notification: Omit<Notification, 'id' | 'time'>) {
            const configStore = useGlobalStore();
            const newNotification = { ...notification, id: this.notificationId++, time: new Date() };
            
            this.notifications.push(newNotification);

            if (this.notificationListener && configStore.config.preferences.notifications.app) {
                this.notificationListener(newNotification);
            }

            if (configStore.config.preferences.notifications.os) {
                window.configurationsApi.notify(notification.title, generateDescription(newNotification));
            }
        },
        clearNotification(id: number) {
            this.notifications.splice(this.notifications.findIndex(notification => notification.id === id), 1);
        },
        clearAllNotifications() {
            this.notifications = [];
        },
    },
});
