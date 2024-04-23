import {
    type Ref,
    h,
} from 'vue';
import {
    NSelect,
    NInput,
    NSwitch,
} from 'naive-ui';
import { type PartialAv1anConfiguration } from '../Configuration/ConfigurationDefaults.vue';
import { type FormInputComponent } from './library';
import { Encoder } from '../../../../main/src/data/Av1an/Types/Options';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration>): FormInputComponent[] {
    const encoder = {
        label: 'Encoder',
        path: 'encoding.encoder',
        component: h(
            NSelect,
            {
                value: formValueRef.value.encoding?.encoder,
                clearable: true,
                options: [
                    { label: 'Alliance for Open Media AV1 (aom)', value: Encoder.aom },
                    { label: 'Scalable Video Technology (svt-av1)', value: Encoder.svt },
                    { label: 'Rust AV1 Encoder (rav1e)', value: Encoder.rav1e },
                    { label: 'Alliance for Open Media VP8/VP9 (vpx)', value: Encoder.vpx },
                    { label: 'Advanced Video Coding (x264)', value: Encoder.x264 },
                    { label: 'High Efficiency Video Coding (x265)', value: Encoder.x265 },
                ],
                onUpdateValue: (value?: Encoder) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {};
                    }

                    if (value !== null) {
                        if (formValueRef.value.encoding.encoder !== value) {
                            // Reset value when changing encoder
                            formValueRef.value.encoding = {};
                        }

                        formValueRef.value.encoding.encoder = value;
                    }
                },
                placeholder: 'Alliance for Open Media AV1 (aom)',
                onClear: () => {
                    delete formValueRef.value.encoding?.encoder;
                },
            },
        ),
    };

    const ffmpegAudioParameters = {
        label: 'FFmpeg Audio Parameters',
        path: 'encoding.FFmpegAudioParameters',
        component: h(
            NInput,
            {
                value: formValueRef.value.encoding?.FFmpegAudioParameters,
                clearable: true,
                onUpdateValue: (value?: string) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {};
                    }

                    if (value !== null) {
                        formValueRef.value.encoding.FFmpegAudioParameters = value;
                    }
                },
                placeholder: 'None (-c:a copy)',
                onClear: () => {
                    delete formValueRef.value.encoding?.FFmpegAudioParameters;
                },
            },
        ),
    };

    const ffmpegFilterOptions = {
        label: 'FFmpeg Filter Options',
        path: 'encoding.FFmpegFilterOptions',
        component: h(
            NInput,
            {
                value: formValueRef.value.encoding?.FFmpegFilterOptions,
                clearable: true,
                onUpdateValue: (value?: string) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {};
                    }

                    if (value !== null) {
                        formValueRef.value.encoding.FFmpegFilterOptions = value;
                    }
                },
                placeholder: 'None',
                onClear: () => {
                    delete formValueRef.value.encoding?.FFmpegFilterOptions;
                },
            },
        ),
    };

    const force = {
        label: 'Force',
        path: 'encoding.force',
        component: h(
            NSwitch,
            {
                value: formValueRef.value.encoding?.force,
                onUpdateValue: (value?: boolean) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {};
                    }

                    if (value !== null) {
                        formValueRef.value.encoding.force = value;
                    }
                },
            },
        ),
    };

    const passes = {
        label: 'Passes',
        path: 'encoding.passes',
        component: h(
            NSelect,
            {
                value: formValueRef.value.encoding?.passes,
                clearable: true,
                options: [
                    { label: '1', value: 1 },
                    { label: '2', value: 2 },
                ],
                placeholder: 'None',
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {};
                    }

                    if (value !== null) {
                        formValueRef.value.encoding.passes = value;
                    }
                },
                onClear: () => {
                    delete formValueRef.value.encoding?.passes;
                },
            },
        ),
    };

    return [
        encoder,
        force,
        passes,
        ffmpegFilterOptions,
        ffmpegAudioParameters,
    ];
}