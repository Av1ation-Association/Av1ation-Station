import {
    type Ref,
    h,
} from 'vue';
import {
    NInputNumber,
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
    const keyint = {
        label: 'Keyframe Interval (keyint)',
        path: 'encoding.keyint',
        component: h(
            NInputNumber,
            {
                value: (formValueRef.value.encoding as SVTEncoding)?.keyint,
                clearable: true,
                min: -2,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)?.keyint === value) {
                            delete (formValueRef.value.encoding as SVTEncoding).keyint;
                        } else {
                            (formValueRef.value.encoding as SVTEncoding).keyint = value;
                        }
                    }
                },
                placeholder: '-2 (Auto: ~5 seconds)',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)?.keyint : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding).keyint;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding).keyint = null;
        },
        disabled: () => {
            return (formValueRef.value.encoding as SVTEncoding)?.keyint === null;
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding).keyint;
        },
    };

    const irefresh = {
        label: 'Intra Refresh Type',
        path: `encoding['irefresh-type']`,
        component: h(
            NSelect,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['irefresh-type'] : undefined,
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
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['irefresh-type'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['irefresh-type'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['irefresh-type'] = value;
                        }
                    }
                },
                placeholder: 'KEY Frame (Closed GOP) (2)',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['irefresh-type'] : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['irefresh-type'];
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['irefresh-type'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['irefresh-type']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['irefresh-type'];
        },
    };

    const scd = {
        label: 'Scene Change Detection',
        path: 'encoding.scd',
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding)?.scd,
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
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)?.scd === value) {
                            delete (formValueRef.value.encoding as SVTEncoding).scd;
                        } else {
                            (formValueRef.value.encoding as SVTEncoding).scd = value;
                        }
                    }
                },
                placeholder: 'Disabled (0)',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)?.scd : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding).scd;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding).scd = null;
        },
        disabled: () => {
            return (formValueRef.value.encoding as SVTEncoding)?.scd === null;
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding).scd;
        },
    };

    const lookahead = {
        label: 'Lookahead',
        path: 'encoding.lookahead',
        component: h(
            NSlider,
            {
                value: (formValueRef.value.encoding as SVTEncoding)?.lookahead ?? undefined,
                min: -1,
                max: 120,
                step: 1,
                marks: {
                    '-1': 'Auto (Default)',
                },
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)?.lookahead ?? -1 : -1,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding).lookahead === value) {
                            delete (formValueRef.value.encoding as SVTEncoding).lookahead;
                        } else {
                            (formValueRef.value.encoding as SVTEncoding).lookahead = value;
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

            (formValueRef.value.encoding as SVTEncoding).lookahead = null;
        },
        disabled: () => {
            return (formValueRef.value.encoding as SVTEncoding)?.lookahead === null;
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding).lookahead;
        },
    };


    return [
        keyint,
        irefresh,
        scd,
        lookahead,
    ];
}