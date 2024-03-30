import {
    type Ref,
    h,
} from 'vue';
import {
    NInputNumber,
    NSelect,
} from 'naive-ui';
import { type PartialAv1anConfiguration } from '../Configuration/ConfigurationDefaults.vue';
import { FFmpegPixelFormat, LogLevel, Verbosity } from '../../../../main/src/data/Av1an/Types/Options';
import { type FormInputComponent } from './library';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration>): FormInputComponent[] {
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
                onUpdateValue: (value?: Verbosity) => {
                    if (value !== null) {
                        formValueRef.value.verbosity = value;
                    }
                },
                onClear: () => {
                    delete formValueRef.value.verbosity;
                },
            },
        ),
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
                onUpdateValue: (value?: LogLevel) => {
                    if (value !== null) {
                        if (!formValueRef.value.logging) {
                            formValueRef.value.logging = {};
                        }
                        formValueRef.value.logging.level = value;
                    }
                },
                onClear: () => {
                    delete formValueRef.value.logging?.level;
                },
            },
        ),
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
                onUpdateValue: (value) => {
                    if (value !== null) {
                        formValueRef.value.maxTries = value;
                    }
                },
                onClear: () => {
                    delete formValueRef.value.maxTries;
                },
            },
        ),
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
                onUpdateValue: (value) => {
                    if (value !== null) {
                        formValueRef.value.workers = value;
                    }
                },
                onClear: () => {
                    delete formValueRef.value.workers;
                },
            },
        ),
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
                onUpdateValue: (value) => {
                    if (value !== null) {
                        formValueRef.value.threadAffinity = value;
                    }
                },
                onClear: () => {
                    delete formValueRef.value.threadAffinity;
                },
            },
        ),
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
                placeholder: 'yuv420p10le',
                onUpdateValue: (value?: FFmpegPixelFormat) => {
                    if (value !== null) {
                        formValueRef.value.pixelFormat = value;
                    }
                },
                onClear: () => {
                    delete formValueRef.value.pixelFormat;
                },
            },
        ),
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