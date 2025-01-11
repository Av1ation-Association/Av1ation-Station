import { h } from 'vue';
import {
    NSelect,
    NInput,
    NSwitch,
    NSlider,
    NInputGroup,
    NButton,
} from 'naive-ui';
import { type ConfigurationType } from '../../../../shared/src/data/Configuration';
import {
    Encoder,
    EncodertoString,
} from '../../../../shared/src/data/Types/Options';
import { useConfigurationsStore } from '../../stores/configurations';
import { type FormInputComponent } from './library';

export function getComponents(): FormInputComponent[] {
    const configurationsStore = useConfigurationsStore<ConfigurationType.Task>();
    const parentAv1an = configurationsStore.parentAv1an;
    const previousAv1an = configurationsStore.previousDefaults.Av1an;

    const encoder = {
        label: 'Encoder',
        path: 'encoding.encoder',
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding?.encoder,
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
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {};
                    }

                    if (value !== null) {
                        if (configurationsStore.defaults.Av1an.encoding.encoder !== value) {
                            // Reset value when changing encoder
                            configurationsStore.defaults.Av1an.encoding = {};
                        }

                        configurationsStore.defaults.Av1an.encoding.encoder = value;
                    }
                },
                placeholder: EncodertoString(parentAv1an.encoding?.encoder ?? Encoder.aom),
                // defaultValue: parentAv1an.encoding?.encoder,
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.encoder;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {};
            }

            configurationsStore.defaults.Av1an.encoding.encoder = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.encoder === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.encoder;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.encoder === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.encoder !== undefined;
            } else if (previousAv1an.encoding.encoder !== configurationsStore.defaults.Av1an.encoding?.encoder) {
                return true;
            } else {
                return false;
            }
        },
    };

    const ffmpegAudioParameters = {
        label: 'FFmpeg Audio Parameters',
        path: 'encoding.FFmpegAudioParameters',
        component: h(
            NInput,
            {
                value: configurationsStore.defaults.Av1an.encoding?.FFmpegAudioParameters,
                clearable: true,
                onUpdateValue: (value?: string) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {};
                    }

                    if (value !== null) {
                        if (parentAv1an.encoding?.FFmpegAudioParameters === value) {
                            delete configurationsStore.defaults.Av1an.encoding?.FFmpegAudioParameters;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.FFmpegAudioParameters = value;
                        }
                    }
                },
                placeholder: parentAv1an.encoding?.FFmpegAudioParameters ?? 'None (-c:a copy)',
                // defaultValue: parentAv1an.encoding?.FFmpegAudioParameters,
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.FFmpegAudioParameters;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {};
            }

            configurationsStore.defaults.Av1an.encoding.FFmpegAudioParameters = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.FFmpegAudioParameters === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.FFmpegAudioParameters;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.FFmpegAudioParameters === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.FFmpegAudioParameters !== undefined;
            } else if (previousAv1an.encoding.FFmpegAudioParameters !== configurationsStore.defaults.Av1an.encoding?.FFmpegAudioParameters) {
                return true;
            } else {
                return false;
            }
        },
    };

    const ffmpegFilterOptions = {
        label: 'FFmpeg Filter Options',
        path: 'encoding.FFmpegFilterOptions',
        component: h(
            NInput,
            {
                value: configurationsStore.defaults.Av1an.encoding?.FFmpegFilterOptions,
                clearable: true,
                onUpdateValue: (value?: string) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {};
                    }

                    if (value !== null) {
                        if (parentAv1an.encoding?.FFmpegFilterOptions === value) {
                            delete configurationsStore.defaults.Av1an.encoding?.FFmpegFilterOptions;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.FFmpegFilterOptions = value;
                        }
                    }
                },
                placeholder: parentAv1an.encoding?.FFmpegFilterOptions ?? 'None',
                // defaultValue: parentAv1an.encoding?.FFmpegFilterOptions,
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.FFmpegFilterOptions;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {};
            }

            configurationsStore.defaults.Av1an.encoding.FFmpegFilterOptions = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.FFmpegFilterOptions === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.FFmpegFilterOptions;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.FFmpegFilterOptions === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.FFmpegFilterOptions !== undefined;
            } else if (previousAv1an.encoding.FFmpegFilterOptions !== configurationsStore.defaults.Av1an.encoding?.FFmpegFilterOptions) {
                return true;
            } else {
                return false;
            }
        },
    };

    const force = {
        label: 'Force',
        path: 'encoding.force',
        advanced: true,
        component: h(
            NSwitch,
            {
                value: configurationsStore.defaults.Av1an.encoding?.force ?? undefined,
                defaultValue: parentAv1an.encoding?.force ?? undefined,
                onUpdateValue: (value?: boolean) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {};
                    }

                    if (value !== null) {
                        if (parentAv1an.encoding?.force === value) {
                            delete configurationsStore.defaults.Av1an.encoding?.force;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.force = value;
                        }
                    }
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {};
            }

            configurationsStore.defaults.Av1an.encoding.force = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.force === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.force;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.force === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.force !== undefined;
            } else if (previousAv1an.encoding.force !== configurationsStore.defaults.Av1an.encoding?.force) {
                return true;
            } else {
                return false;
            }
        },
    };

    const passes = {
        label: 'Passes',
        path: 'encoding.passes',
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding?.passes,
                clearable: true,
                options: [
                    { label: '1', value: 1 },
                    { label: '2', value: 2 },
                ],
                placeholder: parentAv1an.encoding?.passes?.toString() ?? 'None',
                // defaultValue: parentAv1an.encoding?.passes,
                onUpdateValue: (value?: 1 | 2 | null) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {};
                    }

                    if (value !== null) {
                        if (parentAv1an.encoding?.passes === value) {
                            delete configurationsStore.defaults.Av1an.encoding?.passes;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.passes = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.passes;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {};
            }

            configurationsStore.defaults.Av1an.encoding.passes = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.passes === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.passes;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.passes === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.passes !== undefined;
            } else if (previousAv1an.encoding.passes !== configurationsStore.defaults.Av1an.encoding?.passes) {
                return true;
            } else {
                return false;
            }
        },
    };

    const photonNoise = {
        label: 'Photon Noise',
        path: 'photonNoise',
        component: h(
            NSlider,
            {
                value: configurationsStore.defaults.Av1an.photonNoise ?? undefined,
                min: 0,
                max: 63,
                step: 1,
                defaultValue: parentAv1an.photonNoise ?? undefined,
                onUpdateValue: (value?: number) => {
                    if (value !== null) {
                        if (parentAv1an.photonNoise === value) {
                            delete configurationsStore.defaults.Av1an.photonNoise;
                        } else {
                            configurationsStore.defaults.Av1an.photonNoise = value;
                        }
                    }
                },
            },
        ),
        disable: () => {
            configurationsStore.defaults.Av1an.photonNoise = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.photonNoise === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.photonNoise;
        },
        isModified: () => {
            if (!previousAv1an || previousAv1an.photonNoise === undefined) {
                return configurationsStore.defaults.Av1an.photonNoise !== undefined;
            } else if (previousAv1an.photonNoise !== configurationsStore.defaults.Av1an.photonNoise) {
                return true;
            } else {
                return false;
            }
        },
    };

    const zones = {
        label: 'Zones',
        path: 'zones',
        component: h(
            NInputGroup,
            undefined,
            () => [
                h(
                    NInput, {
                        value: configurationsStore.defaults.Av1an.zones,
                        clearable: true,
                        onUpdateValue: (value) => {
                            if (value) {
                                if (parentAv1an.zones === value) {
                                    delete configurationsStore.defaults.Av1an.zones;
                                } else {
                                    configurationsStore.defaults.Av1an.zones = value;
                                }
                            }
                        },
                        placeholder: parentAv1an.zones ?? 'Zones File Path',
                        // defaultValue: parentAv1an.zones,
                        onClear: () => {
                            delete configurationsStore.defaults.Av1an.zones;
                        },
                    },
                ),
                h(
                    NButton,
                    {
                        type: 'primary',
                        onClick: async () => {
                            const defaultPath = configurationsStore.defaults.Av1an.zones; // TODO: fallback to output directory
                            const zonesFilePath = await window.configurationsApi['save-file'](defaultPath ?? undefined, 'VMAF Model');
                            if (zonesFilePath) {
                                if (parentAv1an.zones === zonesFilePath) {
                                    delete configurationsStore.defaults.Av1an.zones;
                                } else {
                                    configurationsStore.defaults.Av1an.zones = zonesFilePath;
                                }
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
            configurationsStore.defaults.Av1an.zones = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.zones === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.zones;
        },
        isModified: () => {
            if (!previousAv1an || previousAv1an.zones === undefined) {
                return configurationsStore.defaults.Av1an.zones !== undefined;
            } else if (previousAv1an.zones !== configurationsStore.defaults.Av1an.zones) {
                return true;
            } else {
                return false;
            }
        },
    };

    return [
        encoder,
        force,
        passes,
        ffmpegFilterOptions,
        ffmpegAudioParameters,
        photonNoise,
        zones,
    ];
}
