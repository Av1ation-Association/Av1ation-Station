import {
    type Ref,
    h,
} from 'vue';
import {
    NSelect,
    NSlider,
} from 'naive-ui';
import { type PartialAv1anConfiguration } from '../../Configuration/ConfigurationDefaults.vue';
import { type SVTEncoding, Encoder } from '../../../../../main/src/data/Av1an/Types/Options';
import { type FormInputComponent } from '../library';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration>): FormInputComponent[] {

    const crf = {
        label: 'Constant Rate Factor (CRF)',
        path: 'encoding.crf',
        component: h(
            NSlider,
            {
                value: (formValueRef.value.encoding as SVTEncoding).crf ?? 35,
                min: 0,
                max: 63,
                step: 1,
                marks: {
                    35: 'Default',
                },
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding).crf = value;
                    }
                },
            },
        ),
    };

    const aqMode = {
        label: 'Adaptive Quantization Mode',
        path: `encoding['aq-mode']`,
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['aq-mode'],
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
                        (formValueRef.value.encoding as SVTEncoding)['aq-mode'] = value;
                    }
                },
                placeholder: 'DeltaQ Pred Efficiency (2)',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['aq-mode'];
                },
            },
        ),
    };

    const enableqm = {
        label: 'Enable Quantization Matrices',
        path: `encoding['enable-qm']`,
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['enable-qm'],
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
                        (formValueRef.value.encoding as SVTEncoding)['enable-qm'] = value;
                    }
                },
                placeholder: 'Yes (1)',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-qm'];
                },
            },
        ),
    };

    const qmMin = {
        label: 'Minimum Quant Matrix Flatness',
        path: `encoding['qm-min']`,
        component: h(
            NSlider,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['qm-min'],
                min: 0,
                max: 15,
                step: 1,
                marks: {
                    0: 'Default',
                },
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding)['qm-min'] = value;
                    }
                },
            },
        ),
    };

    const qmMax = {
        label: 'Maximum Quant Matrix Flatness',
        path: `encoding['qm-max']`,
        component: h(
            NSlider,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['qm-max'] ?? 15,
                min: 0,
                max: 15,
                step: 1,
                marks: {
                    15: 'Default',
                },
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding)['qm-max'] = value;
                    }
                },
            },
        ),
    };

    const varianceBoostStrength = {
        label: 'Variance Boost Strength',
        path: `encoding['variance-boost-strength']`,
        component: h(
            NSlider,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['variance-boost-strength'] ?? 2,
                min: 0,
                max: 4,
                step: 1,
                marks: {
                    2: 'Default',
                },
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding)['variance-boost-strength'] = value;
                    }
                },
            },
        ),
    };

    const varianceOctile = {
        label: 'Variance Octile',
        path: `encoding['variance-octile']`,
        component: h(
            NSlider,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['variance-octile'] ?? 6,
                min: 0,
                max: 8,
                step: 1,
                marks: {
                    6: 'Default',
                },
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding)['variance-octile'] = value;
                    }
                },
            },
        ),
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