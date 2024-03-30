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
import { type PartialAv1anConfiguration } from '../../Configuration/ConfigurationDefaults.vue';
import { type SVTEncoding, Encoder } from '../../../../../main/src/data/Av1an/Types/Options';
import { type FormInputComponent } from '../library';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration>): FormInputComponent[] {
    const preset = {
        label: 'Preset',
        path: 'encoding.preset',
        component: h(
            NSlider,
            {
                value: (formValueRef.value.encoding as SVTEncoding).preset ?? 10,
                min: -3,
                max: 12,
                step: 1,
                marks: {
                    '-1': 'Research',
                    6: 'Recommended',
                    10: 'Default',
                },
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }
                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding).preset = value;
                    }
                },
            },
        ),
    };

    const errlog = {
        label: 'Error Log File',
        path: 'encoding.errlog',
        component: h(
            NInputGroup,
            undefined,
            () => [
                h(
                    NInput,
                    {
                        value: (formValueRef.value.encoding as SVTEncoding).errlog,
                        clearable: true,
                        onUpdateValue: (value?: string) => {
                            if (!formValueRef.value.encoding) {
                                formValueRef.value.encoding = {
                                    encoder: Encoder.svt,
                                };
                            }
                            if (value) {
                                (formValueRef.value.encoding as SVTEncoding).errlog = value;
                            }
                        },
                        placeholder: 'Error Log File Path',
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
                            const errlogFilePath = await window.configurationsApi['save-file'](defaultPath, 'Error Log File');
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
    };

    const statFile = {
        label: 'Stat File',
        path: `encoding['stat-file']`,
        component: h(
            NInputGroup,
            undefined,
            () => [
                h(
                    NInput,
                    {
                        value: (formValueRef.value.encoding as SVTEncoding)['stat-file'],
                        clearable: true,
                        onUpdateValue: (value?: string) => {
                            if (!formValueRef.value.encoding) {
                                formValueRef.value.encoding = {
                                    encoder: Encoder.svt,
                                };
                            }
                            if (value !== null) {
                                (formValueRef.value.encoding as SVTEncoding)['stat-file'] = value;
                            }
                        },
                        placeholder: 'Stat File Path',
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
                            const statFilePath = await window.configurationsApi['save-file'](defaultPath, 'Stat File');
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
    };

    const predStructFile = {
        label: 'Prediction Structure File',
        path: `encoding['pred-struct-file']`,
        component: h(
            NInputGroup,
            undefined,
            () => [
                h(
                    NInput,
                    {
                        value: (formValueRef.value.encoding as SVTEncoding)['pred-struct-file'],
                        clearable: true,
                        onUpdateValue: (value?: string) => {
                            if (!formValueRef.value.encoding) {
                                formValueRef.value.encoding = {
                                    encoder: Encoder.svt,
                                };
                            }
                            if (value !== null) {
                                (formValueRef.value.encoding as SVTEncoding)['pred-struct-file'] = value;
                            }
                        },
                        placeholder: 'Prediction Structure File Path',
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
                            const predStructFilePath = await window.configurationsApi['save-file'](defaultPath, 'Prediction Structure File');
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
    };

    const progress = {
        label: 'Progress',
        path: 'encoding.progress',
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding).progress,
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
                        (formValueRef.value.encoding as SVTEncoding).progress = value;
                    }
                },
                placeholder: 'None (0)',
            },
        ),
    };

    return [
        preset,
        errlog,
        statFile,
        predStructFile,
        progress,
    ];
}