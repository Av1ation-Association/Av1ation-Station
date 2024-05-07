import {
    type Ref,
    h,
} from 'vue';
import {
    NSelect,
    NInput,
    NSwitch,
} from 'naive-ui';
import {
    type PartialChildren,
    type PartialAv1anConfiguration,
} from '../Configuration/ConfigurationDefaults.vue';
import { type FormInputComponent } from './library';
import { Encoder } from '../../../../main/src/data/Av1an/Types/Options';
import { type Task } from '../../../../main/src/data/Configuration/Projects';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration | PartialChildren<Task['item']['Av1an']>>, parentAv1anValue?: PartialAv1anConfiguration): FormInputComponent[] {
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
                defaultValue: parentAv1anValue?.encoding?.encoder,
                onClear: () => {
                    delete formValueRef.value.encoding?.encoder;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {};
            }

            formValueRef.value.encoding.encoder = null;
        },
        disabled: () => {
            return formValueRef.value.encoding?.encoder === null;
        },
        reset: () => {
            delete formValueRef.value.encoding?.encoder;
        },
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
                        if (parentAv1anValue?.encoding?.FFmpegAudioParameters === value) {
                            delete formValueRef.value.encoding?.FFmpegAudioParameters;
                        } else {
                            formValueRef.value.encoding.FFmpegAudioParameters = value;
                        }
                    }
                },
                placeholder: 'None (-c:a copy)',
                defaultValue: parentAv1anValue?.encoding?.FFmpegAudioParameters,
                onClear: () => {
                    delete formValueRef.value.encoding?.FFmpegAudioParameters;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {};
            }

            formValueRef.value.encoding.FFmpegAudioParameters = null;
        },
        disabled: () => {
            return formValueRef.value.encoding?.FFmpegAudioParameters === null;
        },
        reset: () => {
            delete formValueRef.value.encoding?.FFmpegAudioParameters;
        },
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
                        if (parentAv1anValue?.encoding?.FFmpegFilterOptions === value) {
                            delete formValueRef.value.encoding?.FFmpegFilterOptions;
                        } else {
                            formValueRef.value.encoding.FFmpegFilterOptions = value;
                        }
                    }
                },
                placeholder: 'None',
                defaultValue: parentAv1anValue?.encoding?.FFmpegFilterOptions,
                onClear: () => {
                    delete formValueRef.value.encoding?.FFmpegFilterOptions;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {};
            }

            formValueRef.value.encoding.FFmpegFilterOptions = null;
        },
        disabled: () => {
            return formValueRef.value.encoding?.FFmpegFilterOptions === null;
        },
        reset: () => {
            delete formValueRef.value.encoding?.FFmpegFilterOptions;
        },
    };

    const force = {
        label: 'Force',
        path: 'encoding.force',
        component: h(
            NSwitch,
            {
                value: formValueRef.value.encoding?.force ?? undefined,
                defaultValue: parentAv1anValue?.encoding?.force ?? undefined,
                onUpdateValue: (value?: boolean) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {};
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.force === value) {
                            delete formValueRef.value.encoding?.force;
                        } else {
                            formValueRef.value.encoding.force = value;
                        }
                    }
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {};
            }

            formValueRef.value.encoding.force = null;
        },
        disabled: () => {
            return formValueRef.value.encoding?.force === null;
        },
        reset: () => {
            delete formValueRef.value.encoding?.force;
        },
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
                defaultValue: parentAv1anValue?.encoding?.passes,
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {};
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.passes === value) {
                            delete formValueRef.value.encoding?.passes;
                        } else {
                            formValueRef.value.encoding.passes = value;
                        }
                    }
                },
                onClear: () => {
                    delete formValueRef.value.encoding?.passes;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {};
            }

            formValueRef.value.encoding.passes = null;
        },
        disabled: () => {
            return formValueRef.value.encoding?.passes === null;
        },
        reset: () => {
            delete formValueRef.value.encoding?.passes;
        },
    };

    return [
        encoder,
        force,
        passes,
        ffmpegFilterOptions,
        ffmpegAudioParameters,
    ];
}