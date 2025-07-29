import { h } from 'vue';
import {
    NButton,
    NInput,
    NInputGroup,
    NInputNumber,
    NSelect,
} from 'naive-ui';
import {
    FFmpegPixelFormat,
    LogLevel,
    LogLevelToString,
    Verbosity,
} from '../../../../shared/src/data/Types/Options';
import { type FormInputComponent } from './library';
import { ConfigurationType } from '../../../../shared/src/data/Configuration';
import { type Task } from '../../../../shared/src/data/Projects';
import { useConfigurationsStore } from '../../stores/configurations';

export function getComponents(task?: Task): FormInputComponent[] {
    const configurationsStore = useConfigurationsStore<ConfigurationType.Task>();
    const parentAv1an = configurationsStore.parentAv1an;
    const previousAv1an = configurationsStore.previousDefaults.Av1an;

    let proxy: FormInputComponent | undefined = undefined;

    if (task) {
        proxy = {
            label: 'Proxy File Path',
            path: 'proxy',
            component: h(
                NInputGroup,
                undefined,
                () => [
                    h(
                        NInput, {
                            value: configurationsStore.defaults.Av1an.proxy,
                            clearable: true,
                            onUpdateValue: (value) => {
                                if (value) {
                                    configurationsStore.defaults.Av1an.proxy = value;
                                }
                            },
                            placeholder: configurationsStore.defaults.Av1an.proxy ?? 'Proxy File Path',
                            onClear: async () => {
                                delete configurationsStore.defaults.Av1an.proxy;
                            },
                        },
                    ),
                    h(
                        NButton,
                        {
                            type: 'primary',
                            onClick: async () => {
                                const defaultPath = configurationsStore.defaults.Av1an.proxy;
                                const filePath = await window.configurationsApi['save-file'](defaultPath ?? undefined, 'Av1an Proxy Input File');
                                if (filePath) {
                                    configurationsStore.defaults.Av1an.proxy = filePath;
                                }
                            },
                        },
                        () => [
                            'Select',
                        ],
                    ),
                ],
            ),
            reset: () => {
                delete configurationsStore.defaults.Av1an.proxy;
            },
            isModified: () => {
                if (!previousAv1an.proxy) {
                    return configurationsStore.defaults.Av1an.proxy !== undefined;
                } else if (previousAv1an.proxy !== configurationsStore.defaults.Av1an.proxy) {
                    return true;
                } else {
                    return false;
                }
            },
        };
    }

    const verbosity: FormInputComponent = {
        label: 'Verbosity',
        path: 'verbosity',
        advanced: true,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.verbosity,
                clearable: true,
                options: [
                    { label: 'Quiet', value: Verbosity.quiet },
                    { label: 'Verbose', value: Verbosity.verbose },
                ],
                placeholder: parentAv1an.verbosity === Verbosity.quiet ? 'Quiet' : parentAv1an.verbosity === Verbosity.verbose ? 'Verbose' : 'None',
                onUpdateValue: (value?: Verbosity) => {
                    if (value !== null) {
                        if (configurationsStore.configurationType !== ConfigurationType.Config && parentAv1an.verbosity === value) {
                            delete configurationsStore.defaults.Av1an.verbosity;
                        } else {
                            configurationsStore.defaults.Av1an.verbosity = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.verbosity;
                },
            },
        ),
        disable: () => {
            configurationsStore.defaults.Av1an.verbosity = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.verbosity === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.verbosity;
        },
        isModified: () => {
            if (!previousAv1an.verbosity) {
                return configurationsStore.defaults.Av1an.verbosity !== undefined;
            } else if (previousAv1an.verbosity !== configurationsStore.defaults.Av1an.verbosity) {
                return true;
            } else {
                return false;
            }
        },
    };

    const logLevel: FormInputComponent = {
        label: 'Log Level',
        path: 'logging.level',
        advanced: true,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.logging?.level,
                clearable: true,
                options: [
                    { label: 'Error', value: LogLevel.error },
                    { label: 'Warning', value: LogLevel.warning },
                    { label: 'Info', value: LogLevel.info },
                    { label: 'Debug', value: LogLevel.debug },
                    { label: 'Trace', value: LogLevel.trace },
                ],
                placeholder: LogLevelToString(parentAv1an.logging?.level ?? LogLevel.debug),
                // defaultValue: parentAv1an.logging?.level,
                onUpdateValue: (value?: LogLevel) => {
                    if (value !== null) {
                        if (configurationsStore.configurationType !== ConfigurationType.Config && parentAv1an.logging?.level === value) {
                            delete configurationsStore.defaults.Av1an.logging?.level;
                        } else {
                            if (!configurationsStore.defaults.Av1an.logging) {
                                configurationsStore.defaults.Av1an.logging = {};
                            }
                            configurationsStore.defaults.Av1an.logging.level = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.logging?.level;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.logging) {
                configurationsStore.defaults.Av1an.logging = {};
            }

            configurationsStore.defaults.Av1an.logging.level = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.logging?.level === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.logging?.level;
        },
        isModified: () => {
            if (!previousAv1an.logging || previousAv1an.logging.level === undefined) {
                return configurationsStore.defaults.Av1an.logging?.level !== undefined;
            } else if (previousAv1an.logging.level !== configurationsStore.defaults.Av1an.logging?.level) {
                return true;
            } else {
                return false;
            }
        },
    };

    const maxTries: FormInputComponent = {
        label: 'Maximum Tries',
        path: 'maxTries',
        component: h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1an.maxTries,
                clearable: true,
                min: 0,
                placeholder: parentAv1an.maxTries?.toString() ?? '3',
                // defaultValue: parentAv1an.maxTries,
                onUpdateValue: (value) => {
                    if (value !== null) {
                        if (configurationsStore.configurationType !== ConfigurationType.Config && parentAv1an.maxTries === value) {
                            delete configurationsStore.defaults.Av1an.maxTries;
                        } else {
                            configurationsStore.defaults.Av1an.maxTries = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.maxTries;
                },
            },
        ),
        disable: () => {
            configurationsStore.defaults.Av1an.maxTries = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.maxTries === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.maxTries;
        },
        isModified: () => {
            if (previousAv1an.maxTries === undefined) {
                return configurationsStore.defaults.Av1an.maxTries !== undefined;
            } else if (previousAv1an.maxTries !== configurationsStore.defaults.Av1an.maxTries) {
                return true;
            } else {
                return false;
            }
        },
    };

    const workers: FormInputComponent = {
        label: 'Workers',
        path: 'workers',
        component: h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1an.workers,
                clearable: true,
                min: 0,
                placeholder: parentAv1an.workers?.toString() ?? 'Auto (0)',
                // defaultValue: parentAv1an.workers,
                onUpdateValue: (value) => {
                    if (value !== null) {
                        if (parentAv1an.workers === value) {
                            delete configurationsStore.defaults.Av1an.workers;
                        } else {
                            configurationsStore.defaults.Av1an.workers = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.workers;
                },
            },
        ),
        disable: () => {
            configurationsStore.defaults.Av1an.workers = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.workers === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.workers;
        },
        isModified: () => {
            if (previousAv1an.workers === undefined) {
                return configurationsStore.defaults.Av1an.workers !== undefined;
            } else if (previousAv1an.workers !== configurationsStore.defaults.Av1an.workers) {
                return true;
            } else {
                return false;
            }
        },
    };

    const threadAffinity: FormInputComponent = {
        label: 'Thread Affinity',
        path: 'threadAffinity',
        component: h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1an.threadAffinity,
                clearable: true,
                min: 1,
                placeholder: parentAv1an.threadAffinity?.toString() ?? 'None',
                // defaultValue: parentAv1an.threadAffinity,
                onUpdateValue: (value) => {
                    if (value !== null) {
                        if (parentAv1an.threadAffinity === value) {
                            delete configurationsStore.defaults.Av1an.threadAffinity;
                        } else {
                            configurationsStore.defaults.Av1an.threadAffinity = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.threadAffinity;
                },
            },
        ),
        disable: () => {
            configurationsStore.defaults.Av1an.threadAffinity = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.threadAffinity === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.threadAffinity;
        },
        isModified: () => {
            if (previousAv1an.threadAffinity === undefined) {
                return configurationsStore.defaults.Av1an.threadAffinity !== undefined;
            } else if (previousAv1an.threadAffinity !== configurationsStore.defaults.Av1an.threadAffinity) {
                return true;
            } else {
                return false;
            }
        },
    };

    const pixelFormat: FormInputComponent = {
        label: 'Pixel Format',
        path: 'pixelFormat',
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.pixelFormat,
                clearable: true,
                options: [
                    { label: 'yuv420p10le', value: FFmpegPixelFormat.yuv420p10le },
                    // { label: 'yuv420p', value: FFmpegPixelFormat.YUV420P },
                ],
                placeholder: 'yuv420p10le',
                // defaultValue: parentAv1an.pixelFormat,
                onUpdateValue: (value?: FFmpegPixelFormat) => {
                    if (value !== null) {
                        if (parentAv1an.pixelFormat === value) {
                            delete configurationsStore.defaults.Av1an.pixelFormat;
                        } else {
                            configurationsStore.defaults.Av1an.pixelFormat = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.pixelFormat;
                },
            },
        ),
        disable: () => {
            configurationsStore.defaults.Av1an.pixelFormat = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.pixelFormat === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.pixelFormat;
        },
        isModified: () => {
            if (previousAv1an.pixelFormat === undefined) {
                return configurationsStore.defaults.Av1an.pixelFormat !== undefined;
            } else if (previousAv1an.pixelFormat !== configurationsStore.defaults.Av1an.pixelFormat) {
                return true;
            } else {
                return false;
            }
        },
    };

    const vspipeArgs = {
        label: 'VapourSynth VSPipe Arguments',
        path: `vspipeArguments`,
        component: h(
            NInput, {
                value: configurationsStore.defaults.Av1an.vspipeArguments,
                clearable: true,
                onUpdateValue: (value) => {
                    if (value) {
                        configurationsStore.defaults.Av1an.vspipeArguments = value;
                    }
                },
                placeholder: configurationsStore.defaults.Av1an.vspipeArguments ?? '',
                onClear: async () => {
                    delete configurationsStore.defaults.Av1an.vspipeArguments;
                },
            },
        ),
        reset: () => {
            delete configurationsStore.defaults.Av1an.vspipeArguments;
        },
        isModified: () => {
            if (!previousAv1an.vspipeArguments) {
                return configurationsStore.defaults.Av1an.vspipeArguments !== undefined;
            } else if (previousAv1an.vspipeArguments !== configurationsStore.defaults.Av1an.vspipeArguments) {
                return true;
            } else {
                return false;
            }
        },
    };    

    return [
        ...(proxy ? [proxy] : []),
        vspipeArgs,
        workers,
        threadAffinity,
        maxTries,
        pixelFormat,
        verbosity,
        logLevel,
    ];
}
