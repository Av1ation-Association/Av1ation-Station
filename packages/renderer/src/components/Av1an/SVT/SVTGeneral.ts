import { h } from 'vue';
import {
    NButton,
    NInput,
    NInputGroup,
    NSelect,
    NSlider,
} from 'naive-ui';
import { Encoder } from '../../../../../shared/src/data/Types/Options';
import { type FormInputComponent } from '../library';
import { type ConfigurationType } from '../../../../../shared/src/data/Configuration';
import { useConfigurationsStore } from '../../../stores/configurations';

export function getComponents(): FormInputComponent[] {
    const configurationsStore = useConfigurationsStore<ConfigurationType.Task, Encoder.svt>();
    const parentAv1an = configurationsStore.parentAv1an;
    const previousAv1an = configurationsStore.previousDefaults.Av1an;

    const preset = {
        label: 'Preset',
        path: 'encoding.preset',
        span: 2,
        component: h(
            NSlider,
            {
                value: configurationsStore.defaults.Av1an.encoding?.preset ?? undefined,
                min: -3,
                max: 12,
                step: 1,
                marks: {
                    '-1': 'Debugging',
                    6: 'Fast/Realtime',
                    10: 'Default',
                },
                defaultValue: parentAv1an.encoding?.encoder === Encoder.svt ? parentAv1an.encoding.preset ?? 10 : 10,
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1an.encoding?.encoder === Encoder.svt && parentAv1an.encoding.preset === value) {
                            delete configurationsStore.defaults.Av1an.encoding.preset;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.preset = value;
                        }
                    }
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding.preset = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.preset === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.preset;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.preset === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.preset !== undefined;
            } else if (previousAv1an.encoding.preset !== configurationsStore.defaults.Av1an.encoding?.preset) {
                return true;
            } else {
                return false;
            }
        },
    };

    const errlog = {
        label: 'Error Log File',
        path: 'encoding.errlog',
        advanced: true,
        component: h(
            NInputGroup,
            undefined,
            () => [
                h(
                    NInput,
                    {
                        value: configurationsStore.defaults.Av1an.encoding?.errlog,
                        clearable: true,
                        onUpdateValue: (value?: string) => {
                            if (!configurationsStore.defaults.Av1an.encoding) {
                                configurationsStore.defaults.Av1an.encoding = {
                                    encoder: Encoder.svt,
                                };
                            }
                            if (value !== null) {
                                if (parentAv1an.encoding?.encoder === Encoder.svt && parentAv1an.encoding.errlog === value) {
                                    delete configurationsStore.defaults.Av1an.encoding.errlog;
                                } else {
                                    configurationsStore.defaults.Av1an.encoding.errlog = value;
                                }
                            }
                        },
                        // placeholder: 'Error Log File Path',
                        placeholder: parentAv1an.encoding?.encoder === Encoder.svt ? parentAv1an.encoding?.errlog ?? 'Error Log File Path' : 'Error Log File Path',
                        onClear: () => {
                            delete configurationsStore.defaults.Av1an.encoding?.errlog;
                        },
                    },
                ),
                h(
                    NButton,
                    {
                        type: 'primary',
                        onClick: async () => {
                            const defaultPath = configurationsStore.defaults.Av1an.encoding?.errlog; // TODO: fallback to output directory
                            const errlogFilePath = await window.configurationsApi['save-file'](defaultPath ?? undefined, 'Error Log File');
                            if (errlogFilePath) {
                                if (!configurationsStore.defaults.Av1an.encoding) {
                                    configurationsStore.defaults.Av1an.encoding = {
                                        encoder: Encoder.svt,
                                    };
                                }
                                configurationsStore.defaults.Av1an.encoding.errlog = errlogFilePath;
                            }
                        },
                    },
                    () => [
                        'Select',
                    ],
                ),
            ],
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding.errlog = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.errlog === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.errlog;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.errlog === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.errlog !== undefined;
            } else if (previousAv1an.encoding.errlog !== configurationsStore.defaults.Av1an.encoding?.errlog) {
                return true;
            } else {
                return false;
            }
        },
    };

    const statFile = {
        label: 'Stat File',
        path: `encoding['stat-file']`,
        advanced: true,
        component: h(
            NInputGroup,
            undefined,
            () => [
                h(
                    NInput,
                    {
                        value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['stat-file'] : undefined,
                        clearable: true,
                        onUpdateValue: (value?: string) => {
                            if (!configurationsStore.defaults.Av1an.encoding) {
                                configurationsStore.defaults.Av1an.encoding = {
                                    encoder: Encoder.svt,
                                };
                            }
                            if (value !== null) {
                                if (parentAv1an.encoding?.encoder === Encoder.svt && parentAv1an.encoding['stat-file'] === value) {
                                    delete configurationsStore.defaults.Av1an.encoding['stat-file'];
                                } else {
                                    configurationsStore.defaults.Av1an.encoding['stat-file'] = value;
                                }
                            }
                        },
                        // placeholder: 'Stat File Path',
                        placeholder: parentAv1an.encoding?.encoder === Encoder.svt ? parentAv1an.encoding['stat-file'] ?? 'Stat File Path' : 'Stat File Path',
                        onClear: () => {
                            delete configurationsStore.defaults.Av1an.encoding?.['stat-file'];
                        },
                    },
                ),
                h(
                    NButton,
                    {
                        type: 'primary',
                        onClick: async () => {
                            const defaultPath = configurationsStore.defaults.Av1an.encoding?.['stat-file']; // TODO: fallback to output directory
                            const statFilePath = await window.configurationsApi['save-file'](defaultPath ?? undefined, 'Stat File');
                            if (statFilePath) {
                                if (!configurationsStore.defaults.Av1an.encoding) {
                                    configurationsStore.defaults.Av1an.encoding = {
                                        encoder: Encoder.svt,
                                    };
                                }
                                configurationsStore.defaults.Av1an.encoding['stat-file'] = statFilePath;
                            }
                        },
                    },
                    () => [
                        'Select',
                    ],
                ),
            ],
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['stat-file'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['stat-file']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['stat-file'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['stat-file'] === undefined) {
                return !!configurationsStore.defaults.Av1an.encoding && configurationsStore.defaults.Av1an.encoding['stat-file'] !== undefined;
            } else if (previousAv1an.encoding['stat-file'] !== configurationsStore.defaults.Av1an.encoding?.['stat-file']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const predStructFile = {
        label: 'Prediction Structure File',
        path: `encoding['pred-struct-file']`,
        advanced: true,
        component: h(
            NInputGroup,
            undefined,
            () => [
                h(
                    NInput,
                    {
                        value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['pred-struct-file'] : undefined,
                        clearable: true,
                        onUpdateValue: (value?: string) => {
                            if (!configurationsStore.defaults.Av1an.encoding) {
                                configurationsStore.defaults.Av1an.encoding = {
                                    encoder: Encoder.svt,
                                };
                            }
                            if (value !== null) {
                                if (parentAv1an.encoding?.encoder === Encoder.svt && parentAv1an.encoding['pred-struct-file'] === value) {
                                    delete configurationsStore.defaults.Av1an.encoding['pred-struct-file'];
                                } else {
                                    configurationsStore.defaults.Av1an.encoding['pred-struct-file'] = value;
                                }
                            }
                        },
                        // placeholder: 'Prediction Structure File Path',
                        placeholder: parentAv1an.encoding?.encoder === Encoder.svt ? parentAv1an.encoding['pred-struct-file'] ?? 'Prediction Structure File Path' : 'Prediction Structure File Path',
                        onClear: () => {
                            delete configurationsStore.defaults.Av1an.encoding?.['pred-struct-file'];
                        },
                    },
                ),
                h(
                    NButton,
                    {
                        type: 'primary',
                        onClick: async () => {
                            const defaultPath = configurationsStore.defaults.Av1an.encoding?.['pred-struct-file']; // TODO: fallback to output directory
                            const predStructFilePath = await window.configurationsApi['save-file'](defaultPath ?? undefined, 'Prediction Structure File');
                            if (predStructFilePath) {
                                if (!configurationsStore.defaults.Av1an.encoding) {
                                    configurationsStore.defaults.Av1an.encoding = {
                                        encoder: Encoder.svt,
                                    };
                                }
                                configurationsStore.defaults.Av1an.encoding['pred-struct-file'] = predStructFilePath;
                            }
                        },
                    },
                    () => [
                        'Select',
                    ],
                ),
            ],
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['pred-struct-file'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['pred-struct-file']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['pred-struct-file'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['pred-struct-file'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['pred-struct-file'] !== undefined;
            } else if (previousAv1an.encoding['pred-struct-file'] !== configurationsStore.defaults.Av1an.encoding?.['pred-struct-file']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const progress = {
        label: 'Progress',
        path: 'encoding.progress',
        advanced: true,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding?.progress,
                clearable: true,
                options: [
                    { label: 'None (0)', value: 0 },
                    { label: 'Default (1)', value: 1 },
                    { label: 'AOM Style (2)', value: 2 },
                    { label: 'PSY Style (3)', value: 3 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1an.encoding?.encoder === Encoder.svt && parentAv1an.encoding.progress === value) {
                            delete configurationsStore.defaults.Av1an.encoding.progress;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.progress = value;
                        }
                    }
                },
                // placeholder: 'None (0)',
                placeholder: parentAv1an.encoding?.encoder === Encoder.svt ? parentAv1an.encoding.progress === 0 ? 'None (0)' : parentAv1an.encoding.progress === 1 ? 'Default (1)' : parentAv1an.encoding.progress === 2 ? 'AOM Style (2)' : 'PSY Style (3)' : 'None (0)',
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding.progress = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.progress === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.progress;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.progress === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.progress !== undefined;
            } else if (previousAv1an.encoding.progress !== configurationsStore.defaults.Av1an.encoding?.progress) {
                return true;
            } else {
                return false;
            }
        },
    };

    return [
        preset,
        errlog,
        statFile,
        predStructFile,
        progress,
    ];
}
