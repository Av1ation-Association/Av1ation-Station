import {
    type Ref,
    h,
} from 'vue';
import {
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

    const crf = {
        label: 'Constant Rate Factor (CRF)',
        path: 'encoding.crf',
        component: h(
            NSlider,
            {
                value: (formValueRef.value.encoding as SVTEncoding)?.crf ?? undefined,
                min: 0,
                max: 63,
                step: 1,
                marks: {
                    35: 'Default',
                },
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)?.crf ?? 35 : 35,
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding).crf === value) {
                            delete (formValueRef.value.encoding as SVTEncoding).crf;
                        } else {
                            (formValueRef.value.encoding as SVTEncoding).crf = value;
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

            (formValueRef.value.encoding as SVTEncoding).crf = null;
        },
        disabled: () => {
            return (formValueRef.value.encoding as SVTEncoding)?.crf === null;
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['crf'];
        },
    };

    const aqMode = {
        label: 'Adaptive Quantization Mode',
        path: `encoding['aq-mode']`,
        component: h(
            NSelect,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['aq-mode'] : undefined,
                clearable: true,
                options: [
                    { label: 'Off (0)', value: 0 },
                    { label: 'Variance base using AV1 segments (1)', value: 1 },
                    { label: 'DeltaQ Pred Efficiency (2)', value: 2 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['aq-mode'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['aq-mode'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['aq-mode'] = value;
                        }
                    }
                },
                placeholder: 'DeltaQ Pred Efficiency (2)',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['aq-mode'] : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['aq-mode'];
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['aq-mode'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['aq-mode']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['aq-mode'];
        },
    };

    const enableqm = {
        label: 'Enable Quantization Matrices',
        path: `encoding['enable-qm']`,
        component: h(
            NSelect,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['enable-qm'] : undefined,
                clearable: true,
                options: [
                    { label: 'No (0)', value: 0 },
                    { label: 'Yes (1)', value: 1 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['enable-qm'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['enable-qm'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['enable-qm'] = value;
                        }
                    }
                },
                placeholder: 'Yes (1)',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['enable-qm'] : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-qm'];
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['enable-qm'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['enable-qm']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['enable-qm'];
        },
    };


    const qmMin = {
        label: 'Minimum Quant Matrix Flatness',
        path: `encoding['qm-min']`,
        component: h(
            NSlider,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['qm-min'] ?? undefined : undefined,
                min: 0,
                max: 15,
                step: 1,
                marks: {
                    0: 'Default',
                },
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['qm-min'] ?? undefined : undefined,
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['qm-min'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['qm-min'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['qm-min'] = value;
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

            (formValueRef.value.encoding as SVTEncoding)['qm-min'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['qm-min']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['qm-min'];
        },
    };

    const qmMax = {
        label: 'Maximum Quant Matrix Flatness',
        path: `encoding['qm-max']`,
        component: h(
            NSlider,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['qm-max'] ?? undefined : undefined,
                min: 0,
                max: 15,
                step: 1,
                marks: {
                    15: 'Default',
                },
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['qm-max'] ?? 15 : 15,
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['qm-max'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['qm-max'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['qm-max'] = value;
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

            (formValueRef.value.encoding as SVTEncoding)['qm-max'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['qm-max']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['qm-max'];
        },
    };

    const varianceBoostStrength = {
        label: 'Variance Boost Strength',
        path: `encoding['variance-boost-strength']`,
        component: h(
            NSlider,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['variance-boost-strength'] ?? undefined : undefined,
                min: 0,
                max: 4,
                step: 1,
                marks: {
                    2: 'Default',
                },
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['variance-boost-strength'] ?? 2 : 2,
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['variance-boost-strength'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['variance-boost-strength'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['variance-boost-strength'] = value;
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

            (formValueRef.value.encoding as SVTEncoding)['variance-boost-strength'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['variance-boost-strength']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['variance-boost-strength'];
        },
    };

    const varianceOctile = {
        label: 'Variance Octile',
        path: `encoding['variance-octile']`,
        component: h(
            NSlider,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['variance-octile'] ?? undefined : undefined,
                min: 0,
                max: 8,
                step: 1,
                marks: {
                    6: 'Default',
                },
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['variance-octile'] ?? 6 : 6,
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['variance-octile'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['variance-octile'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['variance-octile'] = value;
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

            (formValueRef.value.encoding as SVTEncoding)['variance-octile'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['variance-octile']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['variance-octile'];
        },
    };

    return [
        crf,
        aqMode,
        enableqm,
        qmMin,
        qmMax,
        varianceBoostStrength,
        varianceOctile,
    ];
}