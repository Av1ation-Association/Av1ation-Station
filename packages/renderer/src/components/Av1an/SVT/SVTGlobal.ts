import {
    type Ref,
    h,
} from 'vue';
import {
    NInputNumber,
    NSelect,
} from 'naive-ui';
import { type PartialAv1anConfiguration } from '../../Configuration/ConfigurationDefaults.vue';
import { type SVTEncoding, Encoder } from '../../../../../main/src/data/Av1an/Types/Options';
import { type FormInputComponent } from '../library';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration>): FormInputComponent[] {
    const tune = {
        label: 'Tune',
        path: 'encoding.tune',
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding).tune,
                clearable: true,
                options: [
                    { label: 'VQ (0)', value: 0 },
                    { label: 'PSNR (1)', value: 1 },
                    { label: 'SSIM (2)', value: 2 },
                    { label: 'Subjective SSIM (PSY Only) (3)', value: 3 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding).tune = value;
                    }
                },
                placeholder: 'PSNR (1)',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding).tune;
                },
            },
        ),
    };

    const logicalProcessors = {
        label: 'Logical Processors',
        path: 'encoding.lp',
        component: h(
            NInputNumber,
            {
                value: (formValueRef.value.encoding as SVTEncoding).lp,
                clearable: true,
                min: 0,
                defaultValue: formValueRef.value.threadAffinity ?? 0,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding).lp = value;
                    }
                },
                placeholder: '0 (all)',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding).lp;
                },
            },
        ),
    };

    const inputDepth = {
        label: 'Input Depth',
        path: `encoding['input-depth']`,
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['input-depth'],
                clearable: true,
                options: [
                    { label: '8-bit', value: 8 },
                    { label: '10-bit', value: 10 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding)['input-depth'] = value;
                    }
                },
                placeholder: '10',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['input-depth'];
                },
            },
        ),
    };

    const skip = {
        label: 'Skip (Frames)',
        path: 'encoding.skip',
        component: h(
            NInputNumber,
            {
                value: (formValueRef.value.encoding as SVTEncoding).skip,
                clearable: true,
                min: 0,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding).skip = value;
                    }
                },
                placeholder: '0',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding).skip;
                },
            },
        ),
    };

    const bufferedInput = {
        label: 'Buffered Input',
        path: 'encoding.nb',
        component: h(
            NInputNumber,
            {
                value: (formValueRef.value.encoding as SVTEncoding).nb,
                clearable: true,
                min: 0,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding).nb = value;
                    }
                },
                placeholder: '0',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding).nb;
                },
            },
        ),
    };

    const hdr = {
        label: 'Enable High Dynamic Range',
        path: `encoding['enable-hdr']`,
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['enable-hdr'],
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
                        (formValueRef.value.encoding as SVTEncoding)['enable-hdr'] = value;
                    }
                },
                placeholder: 'No (0)',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-hdr'];
                },
            },
        ),
    };

    const fps = {
        label: 'Framerate (FPS)',
        path: 'encoding.fps',
        component: h(
            NInputNumber,
            {
                value: (formValueRef.value.encoding as SVTEncoding).fps,
                clearable: true,
                min: 1,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding).fps = value;
                    }
                },
                placeholder: 'Auto',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding).fps;
                },
            },
        ),
    };

    const enableStatReport = {
        label: 'Enable Stat Report',
        path: `encoding['enable-stat-report']`,
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['enable-stat-report'],
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
                        (formValueRef.value.encoding as SVTEncoding)['enable-stat-report'] = value;
                    }
                },
                placeholder: 'No (0)',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-stat-report'];
                },
            },
        ),
    };

    const fastDecode = {
        label: 'Enable Fast Decode',
        path: `encoding['fast-decode']`,
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['fast-decode'],
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
                        (formValueRef.value.encoding as SVTEncoding)['fast-decode'] = value;
                    }
                },
                placeholder: 'No (0)',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['fast-decode'];
                },
            },
        ),
    };

    return [
        tune,
        logicalProcessors,
        inputDepth,
        skip,
        bufferedInput,
        hdr,
        fps,
        enableStatReport,
        fastDecode,
    ];
}