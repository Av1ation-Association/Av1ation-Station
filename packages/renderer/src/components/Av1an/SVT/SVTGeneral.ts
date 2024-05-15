import {
    type Ref,
    h,
} from 'vue';
import {
    NButton,
    NInput,
    NInputGroup,
    NSelect,
    NSlider,
} from 'naive-ui';
import {
    type PartialChildren,
    type PartialAv1anConfiguration,
} from '../../Configuration/ConfigurationDefaults.vue';
import { type SVTEncoding, Encoder } from '../../../../../main/src/data/Av1an/Types/Options';
import { type FormInputComponent } from '../library';
import { type Task } from '../../../../../main/src/data/Configuration/Projects';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration | PartialChildren<Task['item']['Av1an']>>, parentAv1anValue?: PartialAv1anConfiguration): FormInputComponent[] {
    const preset = {
        label: 'Preset',
        path: 'encoding.preset',
        component: h(
            NSlider,
            {
                value: (formValueRef.value.encoding as SVTEncoding)?.preset ?? undefined,
                min: -3,
                max: 12,
                step: 1,
                marks: {
                    '-1': 'Research',
                    6: 'Recommended',
                    10: 'Default',
                },
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)?.preset ?? 10 : 10,
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding).preset === value) {
                            delete (formValueRef.value.encoding as SVTEncoding).preset;
                        } else {
                            (formValueRef.value.encoding as SVTEncoding).preset = value;
                        }
                    }
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding).preset = null;
        },
        disabled: () => {
            return (formValueRef.value.encoding as SVTEncoding)?.preset === null;
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding).preset;
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
                        value: (formValueRef.value.encoding as SVTEncoding)?.errlog,
                        clearable: true,
                        onUpdateValue: (value?: string) => {
                            if (!formValueRef.value.encoding) {
                                formValueRef.value.encoding = {
                                    encoder: Encoder.svt,
                                };
                            }
                            if (value !== null) {
                                if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding).errlog === value) {
                                    delete (formValueRef.value.encoding as SVTEncoding).errlog;
                                } else {
                                    (formValueRef.value.encoding as SVTEncoding).errlog = value;
                                }
                            }
                        },
                        placeholder: 'Error Log File Path',
                        defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)?.errlog : undefined,
                        onClear: () => {
                            delete (formValueRef.value.encoding as SVTEncoding).errlog;
                        },
                    },
                ),
                h(
                    NButton,
                    {
                        type: 'primary',
                        onClick: async () => {
                            const defaultPath = (formValueRef.value.encoding as SVTEncoding).errlog; // TODO: fallback to output directory
                            const errlogFilePath = await window.configurationsApi['save-file'](defaultPath ?? undefined, 'Error Log File');
                            if (errlogFilePath) {
                                if (!formValueRef.value.encoding) {
                                    formValueRef.value.encoding = {
                                        encoder: Encoder.svt,
                                    };
                                }
                                (formValueRef.value.encoding as SVTEncoding).errlog = errlogFilePath;
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
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding).errlog = null;
        },
        disabled: () => {
            return (formValueRef.value.encoding as SVTEncoding)?.errlog === null;
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding).errlog;
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
                        value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['stat-file'] : undefined,
                        clearable: true,
                        onUpdateValue: (value?: string) => {
                            if (!formValueRef.value.encoding) {
                                formValueRef.value.encoding = {
                                    encoder: Encoder.svt,
                                };
                            }
                            if (value !== null) {
                                if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['stat-file'] === value) {
                                    delete (formValueRef.value.encoding as SVTEncoding)['stat-file'];
                                } else {
                                    (formValueRef.value.encoding as SVTEncoding)['stat-file'] = value;
                                }
                            }
                        },
                        placeholder: 'Stat File Path',
                        defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['stat-file'] : undefined,
                        onClear: () => {
                            delete (formValueRef.value.encoding as SVTEncoding)['stat-file'];
                        },
                    },
                ),
                h(
                    NButton,
                    {
                        type: 'primary',
                        onClick: async () => {
                            const defaultPath = (formValueRef.value.encoding as SVTEncoding)['stat-file']; // TODO: fallback to output directory
                            const statFilePath = await window.configurationsApi['save-file'](defaultPath ?? undefined, 'Stat File');
                            if (statFilePath) {
                                if (!formValueRef.value.encoding) {
                                    formValueRef.value.encoding = {
                                        encoder: Encoder.svt,
                                    };
                                }
                                (formValueRef.value.encoding as SVTEncoding)['stat-file'] = statFilePath;
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
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['stat-file'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['stat-file']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['stat-file'];
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
                        value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['pred-struct-file'] : undefined,
                        clearable: true,
                        onUpdateValue: (value?: string) => {
                            if (!formValueRef.value.encoding) {
                                formValueRef.value.encoding = {
                                    encoder: Encoder.svt,
                                };
                            }
                            if (value !== null) {
                                if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['pred-struct-file'] === value) {
                                    delete (formValueRef.value.encoding as SVTEncoding)['pred-struct-file'];
                                } else {
                                    (formValueRef.value.encoding as SVTEncoding)['pred-struct-file'] = value;
                                }
                            }
                        },
                        placeholder: 'Prediction Structure File Path',
                        defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['pred-struct-file'] : undefined,
                        onClear: () => {
                            delete (formValueRef.value.encoding as SVTEncoding)['pred-struct-file'];
                        },
                    },
                ),
                h(
                    NButton,
                    {
                        type: 'primary',
                        onClick: async () => {
                            const defaultPath = (formValueRef.value.encoding as SVTEncoding)['pred-struct-file']; // TODO: fallback to output directory
                            const predStructFilePath = await window.configurationsApi['save-file'](defaultPath ?? undefined, 'Prediction Structure File');
                            if (predStructFilePath) {
                                if (!formValueRef.value.encoding) {
                                    formValueRef.value.encoding = {
                                        encoder: Encoder.svt,
                                    };
                                }
                                (formValueRef.value.encoding as SVTEncoding)['pred-struct-file'] = predStructFilePath;
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
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['pred-struct-file'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['pred-struct-file']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['pred-struct-file'];
        },
    };

    const progress = {
        label: 'Progress',
        path: 'encoding.progress',
        advanced: true,
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding)?.progress,
                clearable: true,
                options: [
                    { label: 'None (0)', value: 0 },
                    { label: 'Default (1)', value: 1 },
                    { label: 'AOM Style (2)', value: 2 },
                    { label: 'PSY Style (3)', value: 3 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding).progress === value) {
                            delete (formValueRef.value.encoding as SVTEncoding).progress;
                        } else {
                            (formValueRef.value.encoding as SVTEncoding).progress = value;
                        }
                    }
                },
                placeholder: 'None (0)',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding).progress : undefined,
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding).progress = null;
        },
        disabled: () => {
            return (formValueRef.value.encoding as SVTEncoding)?.progress === null;
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding).progress;
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