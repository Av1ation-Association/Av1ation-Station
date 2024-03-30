import {
    type Ref,
    h,
} from 'vue';
import {
    NInputGroup,
    NInputNumber,
    NSelect,
    NSwitch,
} from 'naive-ui';
import { type PartialAv1anConfiguration } from '../Configuration/ConfigurationDefaults.vue';
import {
    SceneDetectionMethod,
    SplitMethod,
} from '../../../../main/src/data/Av1an/Types/Options';
import { type FormInputComponent } from './library';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration>): FormInputComponent[] {
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
                onUpdateValue: (value?: SplitMethod) => {
                    if (!formValueRef.value.scenes) {
                        formValueRef.value.scenes = {};
                    }
                    if (value !== null) {
                        formValueRef.value.scenes.splitMethod = value;
                    }
                },
                onClear: () => {
                    delete formValueRef.value.scenes?.splitMethod;
                },
            },
        ),
    };

    const detectionOnly: FormInputComponent = {
        label: 'Run Scene Detection Only',
        path: 'scenes.detectionOnly',
        component: h(
            NSwitch,
            {
                value: formValueRef.value.scenes?.detectionOnly,
                // defaultValue: false,
                onUpdateValue: (value?: boolean) => {
                    if (!formValueRef.value.scenes) {
                        formValueRef.value.scenes = {};
                    }
                    if (value !== null) {
                        formValueRef.value.scenes.detectionOnly = value;
                    } else {
                        delete formValueRef.value.scenes.detectionOnly;
                    }
                },
            },
        ),
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
                onUpdateValue: (value?: SceneDetectionMethod) => {
                    if (!formValueRef.value.scenes) {
                        formValueRef.value.scenes = {};
                    }
                    if (value !== null) {
                        formValueRef.value.scenes.detectionMethod = value;
                    }
                },
                onClear: () => {
                    delete formValueRef.value.scenes?.detectionMethod;
                },
            },
        ),
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
                min: 1,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.scenes) {
                        formValueRef.value.scenes = {};
                    }
                    if (value !== null) {
                        formValueRef.value.scenes.detectionDownscaleHeight = value;
                    }
                },
                onClear: () => {
                    delete formValueRef.value.scenes?.detectionDownscaleHeight;
                },
            },
        ),
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
                onUpdateValue: (value?: string) => {
                    if (!formValueRef.value.scenes) {
                        formValueRef.value.scenes = {};
                    }
                    if (value !== null) {
                        formValueRef.value.scenes.detectionPixelFormat = value;
                    }
                },
                onClear: () => {
                    delete formValueRef.value.scenes?.detectionPixelFormat;
                },
            },
        ),
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
                min: 1,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.scenes) {
                        formValueRef.value.scenes = {};
                    }
                    if (value !== null) {
                        formValueRef.value.scenes.minimumSceneLengthFrames = value;
                    }
                },
                onClear: () => {
                    delete formValueRef.value.scenes?.minimumSceneLengthFrames;
                },
            },
        ),
    };

    let maximumSceneLengthNumber = !formValueRef.value.scenes?.maximumSceneLength ? 24 : 'frames' in formValueRef.value.scenes.maximumSceneLength ? formValueRef.value.scenes.maximumSceneLength.frames : 'seconds' in formValueRef.value.scenes.maximumSceneLength ? formValueRef.value.scenes.maximumSceneLength.seconds : 10;
    let maximumSceneLengthType: 'frames' | 'seconds' = !formValueRef.value.scenes?.maximumSceneLength ? 'frames' : 'frames' in formValueRef.value.scenes.maximumSceneLength ? 'frames' : 'seconds' in formValueRef.value.scenes.maximumSceneLength ? 'seconds' : 'frames';

    const maximumSceneLength: FormInputComponent = {
        label: 'Maximum Scene Length',
        path: 'scenes.maximumSceneLength',
        component: h(
            NInputGroup,
            undefined,
            () => [
                h(
                    NInputNumber,
                    {
                        value: maximumSceneLengthNumber,
                        clearable: true,
                        placeholder: 'Auto',
                        min: 0,
                        onUpdateValue: (value) => {
                            if (value === null) {
                                delete formValueRef.value.scenes?.maximumSceneLength;

                                if (maximumSceneLengthType === 'frames') {
                                    maximumSceneLengthNumber = 24;
                                }
                                if (maximumSceneLengthType === 'seconds') {
                                    maximumSceneLengthNumber = 10;
                                }
                                return;
                            }

                            maximumSceneLengthNumber = value;
                            if (!formValueRef.value.scenes) {
                                formValueRef.value.scenes = {};
                            }
                            switch (maximumSceneLengthType) {
                                case 'frames':
                                    formValueRef.value.scenes.maximumSceneLength = {
                                        frames: maximumSceneLengthNumber,
                                    };
                                    break;
                                case 'seconds':
                                    formValueRef.value.scenes.maximumSceneLength = {
                                        seconds: maximumSceneLengthNumber,
                                    };
                                    break;
                            }
                        },
                        onClear: () => {
                            delete formValueRef.value.scenes?.maximumSceneLength;
                        },
                    },
                ),
                h(
                    NSelect,
                    {
                        value: maximumSceneLengthType,
                        options: [
                            { label: 'Frames', value: 'frames' },
                            { label: 'Seconds', value: 'seconds' },
                        ],
                        placeholder: 'Frames',
                        onUpdateValue: (value?: 'frames' | 'seconds') => {
                            if (!value) {
                                return;
                            }

                            maximumSceneLengthType = value;
                            if (!formValueRef.value.scenes) {
                                formValueRef.value.scenes = {};
                            }
                            switch (maximumSceneLengthType) {
                                case 'frames':
                                    formValueRef.value.scenes.maximumSceneLength = {
                                        frames: maximumSceneLengthNumber ?? 24,
                                    };
                                    break;
                                case 'seconds':
                                    formValueRef.value.scenes.maximumSceneLength = {
                                        seconds: maximumSceneLengthNumber ?? 10,
                                    };
                                    break;
                            }
                        },
                    },
                ),
            ],
        ),
    };

    const ignoreFrameMismatch: FormInputComponent = {
        label: 'Ignore Scene and Encoder Frame Count Mismatch',
        path: 'scenes.ignoreFrameMismatch',
        component: h(
            NSwitch,
            {
                value: formValueRef.value.scenes?.ignoreFrameMismatch,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.scenes) {
                        formValueRef.value.scenes = {};
                    }
                    if (value !== null) {
                        formValueRef.value.scenes.ignoreFrameMismatch = value;
                    } else {
                        delete formValueRef.value.scenes.ignoreFrameMismatch;
                    }
                },
            },
        ),
    };

    return [
        splitMethod,
        detectionOnly,
        detectionMethod,
        detectionDownscaleHeight,
        detectionPixelFormat,
        minimumSceneLengthFrames,
        maximumSceneLength,
        ignoreFrameMismatch,
    ];
}