import {
    type Ref,
    h,
} from 'vue';
import {
    NInputNumber,
    NSelect,
    NSwitch,
} from 'naive-ui';
import {
    type PartialChildren,
    type PartialAv1anConfiguration,
} from '../Configuration/ConfigurationDefaults.vue';
import {
    SceneDetectionMethod,
    SplitMethod,
} from '../../../../main/src/data/Av1an/Types/Options';
import { type FormInputComponent } from './library';
import { type Task } from '../../../../main/src/data/Configuration/Projects';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration | PartialChildren<Task['item']['Av1an']>>, parentAv1anValue?: PartialAv1anConfiguration): FormInputComponent[] {
    const splitMethod: FormInputComponent = {
        label: 'Split Method',
        path: 'splitMethod',
        component: h(
            NSelect,
            {
                value: formValueRef.value.scenes?.splitMethod,
                clearable: true,
                options: [
                    { label: 'AV Scene Change', value: SplitMethod.avSceneChange },
                    { label: 'None', value: SplitMethod.none },
                ],
                placeholder: 'AV Scene Change',
                defaultValue: parentAv1anValue?.scenes?.splitMethod,
                onUpdateValue: (value?: SplitMethod) => {
                    if (!formValueRef.value.scenes) {
                        formValueRef.value.scenes = {};
                    }
                    if (value !== null) {
                        if (parentAv1anValue?.scenes?.splitMethod === value) {
                            delete formValueRef.value.scenes.splitMethod;
                        } else {
                            formValueRef.value.scenes.splitMethod = value;
                        }
                    }
                },
                onClear: () => {
                    delete formValueRef.value.scenes?.splitMethod;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.scenes) {
                formValueRef.value.scenes = {};
            }

            formValueRef.value.scenes.splitMethod = null;
        },
        disabled: () => {
            return formValueRef.value.scenes?.splitMethod === null;
        },
        reset: () => {
            delete formValueRef.value.scenes?.splitMethod;
        },
    };

    const detectionOnly: FormInputComponent = {
        label: 'Run Scene Detection Only',
        path: 'scenes.detectionOnly',
        component: h(
            NSwitch,
            {
                value: formValueRef.value.scenes?.detectionOnly ?? undefined,
                defaultValue: parentAv1anValue?.scenes?.detectionOnly ?? undefined,
                onUpdateValue: (value?: boolean) => {
                    if (!formValueRef.value.scenes) {
                        formValueRef.value.scenes = {};
                    }
                    if (value !== null) {
                        if (parentAv1anValue?.scenes?.detectionOnly === value) {
                            delete formValueRef.value.scenes.detectionOnly;
                        } else {
                            formValueRef.value.scenes.detectionOnly = value;
                        }
                    } else {
                        delete formValueRef.value.scenes.detectionOnly;
                    }
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.scenes) {
                formValueRef.value.scenes = {};
            }

            formValueRef.value.scenes.detectionOnly = null;
        },
        disabled: () => {
            return formValueRef.value.scenes?.detectionOnly === null;
        },
        reset: () => {
            delete formValueRef.value.scenes?.detectionOnly;
        },
    };

    const detectionMethod: FormInputComponent = {
        label: 'Scene Detection Method',
        path: 'scenes.detectionMethod',
        component: h(
            NSelect,
            {
                value: formValueRef.value.scenes?.detectionMethod,
                clearable: true,
                options: [
                    { label: 'Fast', value: SceneDetectionMethod.fast },
                    { label: 'Standard', value: SceneDetectionMethod.standard },
                ],
                placeholder: 'Standard',
                defaultValue: parentAv1anValue?.scenes?.detectionMethod,
                onUpdateValue: (value?: SceneDetectionMethod) => {
                    if (!formValueRef.value.scenes) {
                        formValueRef.value.scenes = {};
                    }
                    if (value !== null) {
                        if (parentAv1anValue?.scenes?.detectionMethod === value) {
                            delete formValueRef.value.scenes.detectionMethod;
                        } else {
                            formValueRef.value.scenes.detectionMethod = value;
                        }
                    }
                },
                onClear: () => {
                    delete formValueRef.value.scenes?.detectionMethod;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.scenes) {
                formValueRef.value.scenes = {};
            }

            formValueRef.value.scenes.detectionMethod = null;
        },
        disabled: () => {
            return formValueRef.value.scenes?.detectionMethod === null;
        },
        reset: () => {
            delete formValueRef.value.scenes?.detectionMethod;
        },
    };

    const detectionDownscaleHeight: FormInputComponent = {
        label: 'Detection Downscale Height',
        path: 'scenes.detectionDownscaleHeight',
        component: h(
            NInputNumber,
            {
                value: formValueRef.value.scenes?.detectionDownscaleHeight,
                clearable: true,
                placeholder: 'Auto',
                defaultValue: parentAv1anValue?.scenes?.detectionDownscaleHeight,
                min: 1,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.scenes) {
                        formValueRef.value.scenes = {};
                    }
                    if (value !== null) {
                        if (parentAv1anValue?.scenes?.detectionDownscaleHeight === value) {
                            delete formValueRef.value.scenes.detectionDownscaleHeight;
                        } else {
                            formValueRef.value.scenes.detectionDownscaleHeight = value;
                        }
                    }
                },
                onClear: () => {
                    delete formValueRef.value.scenes?.detectionDownscaleHeight;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.scenes) {
                formValueRef.value.scenes = {};
            }

            formValueRef.value.scenes.detectionDownscaleHeight = null;
        },
        disabled: () => {
            return formValueRef.value.scenes?.detectionDownscaleHeight === null;
        },
        reset: () => {
            delete formValueRef.value.scenes?.detectionDownscaleHeight;
        },
    };

    const detectionPixelFormat: FormInputComponent = {
        label: 'Detection Pixel Format',
        path: 'scenes.detectionPixelFormat',
        component: h(
            NSelect,
            {
                value: formValueRef.value.scenes?.detectionPixelFormat,
                clearable: true,
                options: [
                    { label: 'yuv420p10le', value: 'yuv420p10le' },
                ],
                placeholder: 'yuv420p10le',
                defaultValue: parentAv1anValue?.scenes?.detectionPixelFormat,
                onUpdateValue: (value?: string) => {
                    if (!formValueRef.value.scenes) {
                        formValueRef.value.scenes = {};
                    }
                    if (value !== null) {
                        if (parentAv1anValue?.scenes?.detectionPixelFormat === value) {
                            delete formValueRef.value.scenes.detectionPixelFormat;
                        } else {
                            formValueRef.value.scenes.detectionPixelFormat = value;
                        }
                    }
                },
                onClear: () => {
                    delete formValueRef.value.scenes?.detectionPixelFormat;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.scenes) {
                formValueRef.value.scenes = {};
            }

            formValueRef.value.scenes.detectionPixelFormat = null;
        },
        disabled: () => {
            return formValueRef.value.scenes?.detectionPixelFormat === null;
        },
        reset: () => {
            delete formValueRef.value.scenes?.detectionPixelFormat;
        },
    };

    const minimumSceneLengthFrames: FormInputComponent = {
        label: 'Minimum Scene Length (Frames)',
        path: 'scenes.minimumSceneLengthFrames',
        component: h(
            NInputNumber,
            {
                value: formValueRef.value.scenes?.minimumSceneLengthFrames,
                clearable: true,
                placeholder: '24',
                defaultValue: parentAv1anValue?.scenes?.minimumSceneLengthFrames,
                min: 1,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.scenes) {
                        formValueRef.value.scenes = {};
                    }
                    if (value !== null) {
                        if (parentAv1anValue?.scenes?.minimumSceneLengthFrames === value) {
                            delete formValueRef.value.scenes.minimumSceneLengthFrames;
                        } else {
                            formValueRef.value.scenes.minimumSceneLengthFrames = value;
                        }
                    }
                },
                onClear: () => {
                    delete formValueRef.value.scenes?.minimumSceneLengthFrames;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.scenes) {
                formValueRef.value.scenes = {};
            }

            formValueRef.value.scenes.minimumSceneLengthFrames = null;
        },
        disabled: () => {
            return formValueRef.value.scenes?.minimumSceneLengthFrames === null;
        },
        reset: () => {
            delete formValueRef.value.scenes?.minimumSceneLengthFrames;
        },
    };

    const maximumSceneLengthFrames: FormInputComponent = {
        label: 'Maximum Scene Length (Frames)',
        path: 'scenes.maximumSceneLengthFrames',
        component: h(
            NInputNumber,
            {
                value: formValueRef.value.scenes?.maximumSceneLengthFrames,
                clearable: true,
                placeholder: 'None',
                defaultValue: parentAv1anValue?.scenes?.maximumSceneLengthFrames,
                min: 0,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.scenes) {
                        formValueRef.value.scenes = {};
                    }
                    if (value !== null) {
                        if (parentAv1anValue?.scenes?.maximumSceneLengthFrames === value) {
                            delete formValueRef.value.scenes.maximumSceneLengthFrames;
                        } else {
                            formValueRef.value.scenes.maximumSceneLengthFrames = value;
                        }
                    }
                },
                onClear: () => {
                    delete formValueRef.value.scenes?.maximumSceneLengthFrames;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.scenes) {
                formValueRef.value.scenes = {};
            }

            formValueRef.value.scenes.maximumSceneLengthFrames = null;
        },
        disabled: () => {
            return formValueRef.value.scenes?.maximumSceneLengthFrames === null;
        },
        reset: () => {
            delete formValueRef.value.scenes?.maximumSceneLengthFrames;
        },
    };

    const maximumSceneLengthSeconds: FormInputComponent = {
        label: 'Maximum Scene Length (Seconds)',
        path: 'scenes.maximumSceneLengthSeconds',
        component: h(
            NInputNumber,
            {
                value: formValueRef.value.scenes?.maximumSceneLengthSeconds,
                clearable: true,
                placeholder: 'None',
                defaultValue: parentAv1anValue?.scenes?.maximumSceneLengthSeconds,
                min: 0,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.scenes) {
                        formValueRef.value.scenes = {};
                    }
                    if (value !== null) {
                        if (parentAv1anValue?.scenes?.maximumSceneLengthSeconds === value) {
                            delete formValueRef.value.scenes.maximumSceneLengthSeconds;
                        } else {
                            formValueRef.value.scenes.maximumSceneLengthSeconds = value;
                        }
                    }
                },
                onClear: () => {
                    delete formValueRef.value.scenes?.maximumSceneLengthSeconds;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.scenes) {
                formValueRef.value.scenes = {};
            }

            formValueRef.value.scenes.maximumSceneLengthSeconds = null;
        },
        disabled: () => {
            return formValueRef.value.scenes?.maximumSceneLengthSeconds === null;
        },
        reset: () => {
            delete formValueRef.value.scenes?.maximumSceneLengthSeconds;
        },
    };

    const ignoreFrameMismatch: FormInputComponent = {
        label: 'Ignore Scene and Encoder Frame Count Mismatch',
        path: 'scenes.ignoreFrameMismatch',
        component: h(
            NSwitch,
            {
                value: formValueRef.value.scenes?.ignoreFrameMismatch ?? undefined,
                defaultValue: parentAv1anValue?.scenes?.ignoreFrameMismatch ?? undefined,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.scenes) {
                        formValueRef.value.scenes = {};
                    }
                    if (value !== null) {
                        if (parentAv1anValue?.scenes?.ignoreFrameMismatch === value) {
                            delete formValueRef.value.scenes.ignoreFrameMismatch;
                        } else {
                            formValueRef.value.scenes.ignoreFrameMismatch = value;
                        }
                    } else {
                        delete formValueRef.value.scenes.ignoreFrameMismatch;
                    }
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.scenes) {
                formValueRef.value.scenes = {};
            }

            formValueRef.value.scenes.ignoreFrameMismatch = null;
        },
        disabled: () => {
            return formValueRef.value.scenes?.ignoreFrameMismatch === null;
        },
        reset: () => {
            delete formValueRef.value.scenes?.ignoreFrameMismatch;
        },
    };

    return [
        splitMethod,
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