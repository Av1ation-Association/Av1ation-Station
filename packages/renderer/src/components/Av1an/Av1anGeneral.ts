import {
    type Ref,
    h,
} from 'vue';
import {
    NInputNumber,
    NSelect,
} from 'naive-ui';
import {
    type PartialChildren,
    type PartialAv1anConfiguration,
} from '../Configuration/ConfigurationDefaults.vue';
import { FFmpegPixelFormat, LogLevel, Verbosity } from '../../../../main/src/data/Av1an/Types/Options';
import { type FormInputComponent } from './library';
import { type Task } from '../../../../main/src/data/Configuration/Projects';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration | PartialChildren<Task['item']['Av1an']>>, parentAv1anValue?: PartialAv1anConfiguration): FormInputComponent[] {
    const verbosity: FormInputComponent = {
        label: 'Verbosity',
        path: 'verbosity',
        component: h(
            NSelect,
            {
                value: formValueRef.value.verbosity,
                clearable: true,
                options: [
                    { label: 'Quiet', value: Verbosity.quiet },
                    { label: 'Verbose', value: Verbosity.verbose },
                ],
                placeholder: 'None',
                defaultValue: parentAv1anValue?.verbosity,
                onUpdateValue: (value?: Verbosity) => {
                    if (value !== null) {
                        if (parentAv1anValue?.verbosity === value) {
                            delete formValueRef.value.verbosity;
                        } else {
                            formValueRef.value.verbosity = value;
                        }
                    }
                },
                onClear: () => {
                    delete formValueRef.value.verbosity;
                },
            },
        ),
        disable: () => {
            formValueRef.value.verbosity = null;
        },
        disabled: () => {
            return formValueRef.value.verbosity === null;
        },
        reset: () => {
            delete formValueRef.value.verbosity;
        },
    };

    const logLevel: FormInputComponent = {
        label: 'Log Level',
        path: 'logging.level',
        component: h(
            NSelect,
            {
                value: formValueRef.value.logging?.level,
                clearable: true,
                options: [
                    { label: 'Error', value: LogLevel.error },
                    { label: 'Warning', value: LogLevel.warning },
                    { label: 'Info', value: LogLevel.info },
                    { label: 'Debug', value: LogLevel.debug },
                    { label: 'Trace', value: LogLevel.trace },
                ],
                placeholder: 'Debug',
                defaultValue: parentAv1anValue?.logging?.level,
                onUpdateValue: (value?: LogLevel) => {
                    if (value !== null) {
                        if (!formValueRef.value.logging) {
                            formValueRef.value.logging = {};
                        }

                        if (parentAv1anValue?.logging?.level === value) {
                            delete formValueRef.value.logging?.level;
                        } else {
                            formValueRef.value.logging.level = value;
                        }
                    }
                },
                onClear: () => {
                    delete formValueRef.value.logging?.level;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.logging) {
                formValueRef.value.logging = {};
            }

            formValueRef.value.logging.level = null;
        },
        disabled: () => {
            return formValueRef.value.logging?.level === null;
        },
        reset: () => {
            delete formValueRef.value.logging?.level;
        },
    };

    const maxTries: FormInputComponent = {
        label: 'Maximum Tries',
        path: 'maxTries',
        component: h(
            NInputNumber,
            {
                value: formValueRef.value.maxTries,
                clearable: true,
                min: 0,
                placeholder: '3',
                defaultValue: parentAv1anValue?.maxTries,
                onUpdateValue: (value) => {
                    if (value !== null) {
                        if (parentAv1anValue?.maxTries === value) {
                            delete formValueRef.value.maxTries;
                        } else {
                            formValueRef.value.maxTries = value;
                        }
                    }
                },
                onClear: () => {
                    delete formValueRef.value.maxTries;
                },
            },
        ),
        disable: () => {
            formValueRef.value.maxTries = null;
        },
        disabled: () => {
            return formValueRef.value.maxTries === null;
        },
        reset: () => {
            delete formValueRef.value.maxTries;
        },
    };

    const workers: FormInputComponent = {
        label: 'Workers',
        path: 'workers',
        component: h(
            NInputNumber,
            {
                value: formValueRef.value.workers,
                clearable: true,
                min: 0,
                placeholder: 'Auto (0)',
                defaultValue: parentAv1anValue?.workers,
                onUpdateValue: (value) => {
                    if (value !== null) {
                        if (parentAv1anValue?.workers === value) {
                            delete formValueRef.value.workers;
                        } else {
                            formValueRef.value.workers = value;
                        }
                    }
                },
                onClear: () => {
                    delete formValueRef.value.workers;
                },
            },
        ),
        disable: () => {
            formValueRef.value.workers = null;
        },
        disabled: () => {
            return formValueRef.value.workers === null;
        },
        reset: () => {
            delete formValueRef.value.workers;
        },
    };

    const threadAffinity: FormInputComponent = {
        label: 'Thread Affinity',
        path: 'threadAffinity',
        component: h(
            NInputNumber,
            {
                value: formValueRef.value.threadAffinity,
                clearable: true,
                min: 1,
                placeholder: 'None',
                defaultValue: parentAv1anValue?.threadAffinity,
                onUpdateValue: (value) => {
                    if (value !== null) {
                        if (parentAv1anValue?.threadAffinity === value) {
                            delete formValueRef.value.threadAffinity;
                        } else {
                            formValueRef.value.threadAffinity = value;
                        }
                    }
                },
                onClear: () => {
                    delete formValueRef.value.threadAffinity;
                },
            },
        ),
        disable: () => {
            formValueRef.value.threadAffinity = null;
        },
        disabled: () => {
            return formValueRef.value.threadAffinity === null;
        },
        reset: () => {
            delete formValueRef.value.threadAffinity;
        },
    };

    const pixelFormat: FormInputComponent = {
        label: 'Pixel Format',
        path: 'pixelFormat',
        component: h(
            NSelect,
            {
                value: formValueRef.value.pixelFormat,
                clearable: true,
                options: [
                    { label: 'yuv420p10le', value: FFmpegPixelFormat.yuv420p10le },
                    // { label: 'yuv420p', value: FFmpegPixelFormat.YUV420P },
                ],
                defaultValue: parentAv1anValue?.pixelFormat,
                placeholder: 'yuv420p10le',
                onUpdateValue: (value?: FFmpegPixelFormat) => {
                    if (value !== null) {
                        if (parentAv1anValue?.pixelFormat === value) {
                            delete formValueRef.value.pixelFormat;
                        } else {
                            formValueRef.value.pixelFormat = value;
                        }
                    }
                },
                onClear: () => {
                    delete formValueRef.value.pixelFormat;
                },
            },
        ),
        disable: () => {
            formValueRef.value.pixelFormat = null;
        },
        disabled: () => {
            return formValueRef.value.pixelFormat === null;
        },
        reset: () => {
            delete formValueRef.value.pixelFormat;
        },
    };

    return [
        verbosity,
        logLevel,
        maxTries,
        workers,
        threadAffinity,
        pixelFormat,
    ];
}