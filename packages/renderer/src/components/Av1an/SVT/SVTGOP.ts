import {
    type Ref,
    h,
} from 'vue';
import {
    NInputNumber,
    NSelect,
    NSlider,
} from 'naive-ui';
import { type PartialAv1anConfiguration } from '../../Configuration/ConfigurationDefaults.vue';
import { type SVTEncoding, Encoder } from '../../../../../main/src/data/Av1an/Types/Options';
import { type FormInputComponent } from '../library';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration>): FormInputComponent[] {
    const keyint = {
        label: 'Keyframe Interval (keyint)',
        path: 'encoding.keyint',
        component: h(
            NInputNumber,
            {
                value: (formValueRef.value.encoding as SVTEncoding).keyint,
                clearable: true,
                min: -2,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding).keyint = value;
                    }
                },
                placeholder: '-2 (Auto: ~5 seconds)',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding).keyint;
                },
            },
        ),
    };

    const irefresh = {
        label: 'Intra Refresh Type',
        path: `encoding['irefresh-type']`,
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['irefresh-type'],
                clearable: true,
                options: [
                    { label: 'FWD Frame (Open GOP) (1)', value: 1 },
                    { label: 'KEY Frame (Closed GOP) (2)', value: 2 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding)['irefresh-type'] = value;
                    }
                },
                placeholder: 'KEY Frame (Closed GOP) (2)',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['irefresh-type'];
                },
            },
        ),
    };

    const scd = {
        label: 'Scene Change Detection',
        path: 'encoding.scd',
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding).scd,
                clearable: true,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding).scd = value;
                    }
                },
                placeholder: 'Disabled (0)',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding).scd;
                },
            },
        ),
    };

    const lookahead = {
        label: 'Lookahead',
        path: 'encoding.lookahead',
        component: h(
            NSlider,
            {
                value: (formValueRef.value.encoding as SVTEncoding).lookahead,
                min: -1,
                max: 120,
                step: 1,
                marks: {
                    '-1': 'Auto (Default)',
                },
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding).lookahead = value;
                    }
                },
            },
        ),
    };

    return [
        keyint,
        irefresh,
        scd,
        lookahead,
    ];
}