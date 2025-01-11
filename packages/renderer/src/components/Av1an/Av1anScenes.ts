import {
    h,
    toRaw,
} from 'vue';
import {
    NButton,
    NInput,
    NInputGroup,
    NInputNumber,
    NSelect,
    NSwitch,
} from 'naive-ui';
import {
    SceneDetectionMethod,
    SplitMethod,
} from '../../../../shared/src/data/Types/Options';
import { type ConfigurationType } from '../../../../shared/src/data/Configuration';
import { type Task } from '../../../../shared/src/data/Projects';
import { useProjectsStore } from '../../stores/projects';
import { useConfigurationsStore } from '../../stores/configurations';
import { type FormInputComponent } from './library';

export function getComponents(task?: Task): FormInputComponent[] {
    const configurationsStore = useConfigurationsStore<ConfigurationType.Task>();
    const parentAv1an = configurationsStore.parentAv1an;
    const previousAv1an = configurationsStore.previousDefaults.Av1an;

    const splitMethod: FormInputComponent = {
        label: 'Split Method',
        path: 'splitMethod',
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.scenes?.splitMethod,
                clearable: true,
                options: [
                    { label: 'AV Scene Change', value: SplitMethod.avSceneChange },
                    { label: 'None', value: SplitMethod.none },
                ],
                placeholder: parentAv1an.scenes?.splitMethod === SplitMethod.none ? 'None' :  'AV Scene Change',
                // defaultValue: parentAv1an.scenes?.splitMethod,
                onUpdateValue: (value?: SplitMethod) => {
                    if (!configurationsStore.defaults.Av1an.scenes) {
                        configurationsStore.defaults.Av1an.scenes = {};
                    }
                    if (value !== null) {
                        if (parentAv1an.scenes?.splitMethod === value) {
                            delete configurationsStore.defaults.Av1an.scenes.splitMethod;
                        } else {
                            configurationsStore.defaults.Av1an.scenes.splitMethod = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.scenes?.splitMethod;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.scenes) {
                configurationsStore.defaults.Av1an.scenes = {};
            }

            configurationsStore.defaults.Av1an.scenes.splitMethod = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.scenes?.splitMethod === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.scenes?.splitMethod;
        },
        isModified: () => {
            if (!previousAv1an.scenes || previousAv1an.scenes.splitMethod === undefined) {
                return configurationsStore.defaults.Av1an.scenes?.splitMethod !== undefined;
            } else if (previousAv1an.scenes.splitMethod !== configurationsStore.defaults.Av1an.scenes?.splitMethod) {
                return true;
            } else {
                return false;
            }
        },
    };

    let sceneFilePath: FormInputComponent | undefined = undefined;

    if (task) {
        sceneFilePath = {
            label: 'Scene Detection File Path',
            path: 'scenes.path',
            component: h(
                NInputGroup,
                undefined,
                () => [
                    h(
                        NInput, {
                            value: configurationsStore.defaults.Av1an.vmaf?.path,
                            clearable: true,
                            onUpdateValue: (value) => {
                                if (!configurationsStore.defaults.Av1an.scenes) {
                                    configurationsStore.defaults.Av1an.scenes = {};
                                }

                                if (value) {
                                    configurationsStore.defaults.Av1an.scenes.path = value;
                                }
                            },
                            placeholder: configurationsStore.defaults.Av1an.scenes?.path ?? 'Scene Detection File Path',
                            // defaultValue: configurationsStore.defaults.Av1an.scenes?.path ?? undefined,
                            onClear: async () => {
                                const projectsStore = useProjectsStore();
                                const projectIndex = projectsStore.projects.findIndex(p => p.id === task.projectId);
                                const taskIndex = projectsStore.projects[projectIndex].tasks.findIndex(pTask => pTask.id === task.id);
                                // Reset to default
                                const { scenesFilePath } = await projectsStore.buildDefaultTaskPaths(toRaw(projectsStore.projects[projectIndex]), projectsStore.projects[projectIndex].tasks[taskIndex].id, projectsStore.projects[projectIndex].tasks[taskIndex].item.Av1an.input);

                                if (!configurationsStore.defaults.Av1an.scenes) {
                                    configurationsStore.defaults.Av1an.scenes = {};
                                }

                                configurationsStore.defaults.Av1an.scenes.path = scenesFilePath;
                            },
                        },
                    ),
                    h(
                        NButton,
                        {
                            type: 'primary',
                            onClick: async () => {
                                const defaultPath = configurationsStore.defaults.Av1an.scenes?.path;
                                const sceneDetectionFilePath = await window.configurationsApi['save-file'](defaultPath ?? undefined, 'Av1an Scene Detection File');
                                if (sceneDetectionFilePath) {
                                    if (!configurationsStore.defaults.Av1an.scenes) {
                                        configurationsStore.defaults.Av1an.scenes = {};
                                    }

                                    configurationsStore.defaults.Av1an.scenes.path = sceneDetectionFilePath;
                                }
                            },
                        },
                        () => [
                            'Select',
                        ],
                    ),
                ],
            ),
            reset: async () => {
                const projectsStore = useProjectsStore();
                const projectIndex = projectsStore.projects.findIndex(p => p.id === task.projectId);
                const taskIndex = projectsStore.projects[projectIndex].tasks.findIndex(pTask => pTask.id === task.id);
                // Reset to default
                const { scenesFilePath } = await projectsStore.buildDefaultTaskPaths(toRaw(projectsStore.projects[projectIndex]), projectsStore.projects[projectIndex].tasks[taskIndex].id, projectsStore.projects[projectIndex].tasks[taskIndex].item.Av1an.input);

                if (!configurationsStore.defaults.Av1an.scenes) {
                    configurationsStore.defaults.Av1an.scenes = {};
                }

                configurationsStore.defaults.Av1an.scenes.path = scenesFilePath;
            },
            isModified: () => {
                if (!previousAv1an.scenes || previousAv1an.scenes.path === undefined) {
                    return configurationsStore.defaults.Av1an.scenes?.path !== undefined;
                } else if (previousAv1an.scenes.path !== configurationsStore.defaults.Av1an.scenes?.path) {
                    return true;
                } else {
                    return false;
                }
            },
        };
    }

    const detectionOnly: FormInputComponent = {
        label: 'Run Scene Detection Only',
        path: 'scenes.detectionOnly',
        component: h(
            NSwitch,
            {
                value: configurationsStore.defaults.Av1an.scenes?.detectionOnly ?? undefined,
                defaultValue: parentAv1an.scenes?.detectionOnly ?? undefined,
                onUpdateValue: (value?: boolean) => {
                    if (!configurationsStore.defaults.Av1an.scenes) {
                        configurationsStore.defaults.Av1an.scenes = {};
                    }
                    if (value !== null) {
                        if (parentAv1an.scenes?.detectionOnly === value) {
                            delete configurationsStore.defaults.Av1an.scenes.detectionOnly;
                        } else {
                            configurationsStore.defaults.Av1an.scenes.detectionOnly = value;
                        }
                    } else {
                        delete configurationsStore.defaults.Av1an.scenes.detectionOnly;
                    }
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.scenes) {
                configurationsStore.defaults.Av1an.scenes = {};
            }

            configurationsStore.defaults.Av1an.scenes.detectionOnly = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.scenes?.detectionOnly === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.scenes?.detectionOnly;
        },
        isModified: () => {
            if (!previousAv1an.scenes || previousAv1an.scenes.detectionOnly === undefined) {
                return configurationsStore.defaults.Av1an.scenes?.detectionOnly !== undefined;
            } else if (previousAv1an.scenes.detectionOnly !== configurationsStore.defaults.Av1an.scenes?.detectionOnly) {
                return true;
            } else {
                return false;
            }
        },
    };

    const detectionMethod: FormInputComponent = {
        label: 'Scene Detection Method',
        path: 'scenes.detectionMethod',
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.scenes?.detectionMethod,
                clearable: true,
                options: [
                    { label: 'Fast', value: SceneDetectionMethod.fast },
                    { label: 'Standard', value: SceneDetectionMethod.standard },
                ],
                placeholder: parentAv1an.scenes?.detectionMethod === SceneDetectionMethod.fast ? 'Fast' : 'Standard',
                // defaultValue: parentAv1an.scenes?.detectionMethod,
                onUpdateValue: (value?: SceneDetectionMethod) => {
                    if (!configurationsStore.defaults.Av1an.scenes) {
                        configurationsStore.defaults.Av1an.scenes = {};
                    }
                    if (value !== null) {
                        if (parentAv1an.scenes?.detectionMethod === value) {
                            delete configurationsStore.defaults.Av1an.scenes.detectionMethod;
                        } else {
                            configurationsStore.defaults.Av1an.scenes.detectionMethod = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.scenes?.detectionMethod;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.scenes) {
                configurationsStore.defaults.Av1an.scenes = {};
            }

            configurationsStore.defaults.Av1an.scenes.detectionMethod = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.scenes?.detectionMethod === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.scenes?.detectionMethod;
        },
        isModified: () => {
            if (!previousAv1an.scenes || previousAv1an.scenes.detectionMethod === undefined) {
                return configurationsStore.defaults.Av1an.scenes?.detectionMethod !== undefined;
            } else if (previousAv1an.scenes.detectionOnly !== configurationsStore.defaults.Av1an.scenes?.detectionMethod) {
                return true;
            } else {
                return false;
            }
        },
    };

    const detectionDownscaleHeight: FormInputComponent = {
        label: 'Detection Downscale Height',
        path: 'scenes.detectionDownscaleHeight',
        component: h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1an.scenes?.detectionDownscaleHeight,
                clearable: true,
                placeholder: 'Auto',
                defaultValue: parentAv1an.scenes?.detectionDownscaleHeight,
                min: 1,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.scenes) {
                        configurationsStore.defaults.Av1an.scenes = {};
                    }
                    if (value !== null) {
                        if (parentAv1an.scenes?.detectionDownscaleHeight === value) {
                            delete configurationsStore.defaults.Av1an.scenes.detectionDownscaleHeight;
                        } else {
                            configurationsStore.defaults.Av1an.scenes.detectionDownscaleHeight = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.scenes?.detectionDownscaleHeight;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.scenes) {
                configurationsStore.defaults.Av1an.scenes = {};
            }

            configurationsStore.defaults.Av1an.scenes.detectionDownscaleHeight = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.scenes?.detectionDownscaleHeight === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.scenes?.detectionDownscaleHeight;
        },
        isModified: () => {
            if (!previousAv1an.scenes || previousAv1an.scenes.detectionDownscaleHeight === undefined) {
                return configurationsStore.defaults.Av1an.scenes?.detectionDownscaleHeight !== undefined;
            } else if (previousAv1an.scenes.detectionDownscaleHeight !== configurationsStore.defaults.Av1an.scenes?.detectionDownscaleHeight) {
                return true;
            } else {
                return false;
            }
        },
    };

    const detectionPixelFormat: FormInputComponent = {
        label: 'Detection Pixel Format',
        path: 'scenes.detectionPixelFormat',
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.scenes?.detectionPixelFormat,
                clearable: true,
                options: [
                    { label: 'yuv420p10le', value: 'yuv420p10le' },
                ],
                placeholder: 'yuv420p10le',
                defaultValue: parentAv1an.scenes?.detectionPixelFormat,
                onUpdateValue: (value?: string) => {
                    if (!configurationsStore.defaults.Av1an.scenes) {
                        configurationsStore.defaults.Av1an.scenes = {};
                    }
                    if (value !== null) {
                        if (parentAv1an.scenes?.detectionPixelFormat === value) {
                            delete configurationsStore.defaults.Av1an.scenes.detectionPixelFormat;
                        } else {
                            configurationsStore.defaults.Av1an.scenes.detectionPixelFormat = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.scenes?.detectionPixelFormat;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.scenes) {
                configurationsStore.defaults.Av1an.scenes = {};
            }

            configurationsStore.defaults.Av1an.scenes.detectionPixelFormat = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.scenes?.detectionPixelFormat === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.scenes?.detectionPixelFormat;
        },
        isModified: () => {
            if (!previousAv1an.scenes || previousAv1an.scenes.detectionPixelFormat === undefined) {
                return configurationsStore.defaults.Av1an.scenes?.detectionPixelFormat !== undefined;
            } else if (previousAv1an.scenes.detectionPixelFormat !== configurationsStore.defaults.Av1an.scenes?.detectionPixelFormat) {
                return true;
            } else {
                return false;
            }
        },
    };

    const minimumSceneLengthFrames: FormInputComponent = {
        label: 'Minimum Scene Length (Frames)',
        path: 'scenes.minimumSceneLengthFrames',
        component: h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1an.scenes?.minimumSceneLengthFrames,
                clearable: true,
                placeholder: parentAv1an.scenes?.minimumSceneLengthFrames?.toString() ?? '24',
                // defaultValue: parentAv1an.scenes?.minimumSceneLengthFrames,
                min: 1,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.scenes) {
                        configurationsStore.defaults.Av1an.scenes = {};
                    }
                    if (value !== null) {
                        if (parentAv1an.scenes?.minimumSceneLengthFrames === value) {
                            delete configurationsStore.defaults.Av1an.scenes.minimumSceneLengthFrames;
                        } else {
                            configurationsStore.defaults.Av1an.scenes.minimumSceneLengthFrames = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.scenes?.minimumSceneLengthFrames;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.scenes) {
                configurationsStore.defaults.Av1an.scenes = {};
            }

            configurationsStore.defaults.Av1an.scenes.minimumSceneLengthFrames = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.scenes?.minimumSceneLengthFrames === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.scenes?.minimumSceneLengthFrames;
        },
        isModified: () => {
            if (!previousAv1an.scenes || previousAv1an.scenes.minimumSceneLengthFrames === undefined) {
                return configurationsStore.defaults.Av1an.scenes?.minimumSceneLengthFrames !== undefined;
            } else if (previousAv1an.scenes.minimumSceneLengthFrames !== configurationsStore.defaults.Av1an.scenes?.minimumSceneLengthFrames) {
                return true;
            } else {
                return false;
            }
        },
    };

    const maximumSceneLengthFrames: FormInputComponent = {
        label: 'Maximum Scene Length (Frames)',
        path: 'scenes.maximumSceneLengthFrames',
        component: h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1an.scenes?.maximumSceneLengthFrames,
                clearable: true,
                placeholder: parentAv1an.scenes?.maximumSceneLengthFrames?.toString() ?? 'None',
                defaultValue: parentAv1an.scenes?.maximumSceneLengthFrames,
                min: 0,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.scenes) {
                        configurationsStore.defaults.Av1an.scenes = {};
                    }
                    if (value !== null) {
                        if (parentAv1an.scenes?.maximumSceneLengthFrames === value) {
                            delete configurationsStore.defaults.Av1an.scenes.maximumSceneLengthFrames;
                        } else {
                            configurationsStore.defaults.Av1an.scenes.maximumSceneLengthFrames = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.scenes?.maximumSceneLengthFrames;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.scenes) {
                configurationsStore.defaults.Av1an.scenes = {};
            }

            configurationsStore.defaults.Av1an.scenes.maximumSceneLengthFrames = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.scenes?.maximumSceneLengthFrames === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.scenes?.maximumSceneLengthFrames;
        },
        isModified: () => {
            if (!previousAv1an.scenes || previousAv1an.scenes.maximumSceneLengthFrames === undefined) {
                return configurationsStore.defaults.Av1an.scenes?.maximumSceneLengthFrames !== undefined;
            } else if (previousAv1an.scenes.maximumSceneLengthFrames !== configurationsStore.defaults.Av1an.scenes?.maximumSceneLengthFrames) {
                return true;
            } else {
                return false;
            }
        },
    };

    const maximumSceneLengthSeconds: FormInputComponent = {
        label: 'Maximum Scene Length (Seconds)',
        path: 'scenes.maximumSceneLengthSeconds',
        component: h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1an.scenes?.maximumSceneLengthSeconds,
                clearable: true,
                placeholder: parentAv1an.scenes?.maximumSceneLengthSeconds?.toString() ?? 'None',
                defaultValue: parentAv1an.scenes?.maximumSceneLengthSeconds,
                min: 0,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.scenes) {
                        configurationsStore.defaults.Av1an.scenes = {};
                    }
                    if (value !== null) {
                        if (parentAv1an.scenes?.maximumSceneLengthSeconds === value) {
                            delete configurationsStore.defaults.Av1an.scenes.maximumSceneLengthSeconds;
                        } else {
                            configurationsStore.defaults.Av1an.scenes.maximumSceneLengthSeconds = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.scenes?.maximumSceneLengthSeconds;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.scenes) {
                configurationsStore.defaults.Av1an.scenes = {};
            }

            configurationsStore.defaults.Av1an.scenes.maximumSceneLengthSeconds = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.scenes?.maximumSceneLengthSeconds === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.scenes?.maximumSceneLengthSeconds;
        },
        isModified: () => {
            if (!previousAv1an.scenes || previousAv1an.scenes.maximumSceneLengthSeconds === undefined) {
                return configurationsStore.defaults.Av1an.scenes?.maximumSceneLengthSeconds !== undefined;
            } else if (previousAv1an.scenes.maximumSceneLengthSeconds !== configurationsStore.defaults.Av1an.scenes?.maximumSceneLengthSeconds) {
                return true;
            } else {
                return false;
            }
        },
    };

    const ignoreFrameMismatch: FormInputComponent = {
        label: 'Ignore Scene and Encoder Frame Count Mismatch',
        path: 'scenes.ignoreFrameMismatch',
        component: h(
            NSwitch,
            {
                value: configurationsStore.defaults.Av1an.scenes?.ignoreFrameMismatch ?? undefined,
                defaultValue: parentAv1an.scenes?.ignoreFrameMismatch ?? undefined,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.scenes) {
                        configurationsStore.defaults.Av1an.scenes = {};
                    }
                    if (value !== null) {
                        if (parentAv1an.scenes?.ignoreFrameMismatch === value) {
                            delete configurationsStore.defaults.Av1an.scenes.ignoreFrameMismatch;
                        } else {
                            configurationsStore.defaults.Av1an.scenes.ignoreFrameMismatch = value;
                        }
                    } else {
                        delete configurationsStore.defaults.Av1an.scenes.ignoreFrameMismatch;
                    }
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.scenes) {
                configurationsStore.defaults.Av1an.scenes = {};
            }

            configurationsStore.defaults.Av1an.scenes.ignoreFrameMismatch = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.scenes?.ignoreFrameMismatch === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.scenes?.ignoreFrameMismatch;
        },
        isModified: () => {
            if (!previousAv1an.scenes || previousAv1an.scenes.ignoreFrameMismatch === undefined) {
                return configurationsStore.defaults.Av1an.scenes?.ignoreFrameMismatch !== undefined;
            } else if (previousAv1an.scenes.ignoreFrameMismatch !== configurationsStore.defaults.Av1an.scenes?.ignoreFrameMismatch) {
                return true;
            } else {
                return false;
            }
        },
    };

    return [
        splitMethod,
        ...(sceneFilePath ? [sceneFilePath] : []),
        detectionOnly,
        detectionMethod,
        detectionDownscaleHeight,
        detectionPixelFormat,
        minimumSceneLengthFrames,
        maximumSceneLengthFrames,
        maximumSceneLengthSeconds,
        ignoreFrameMismatch,
    ];
}
