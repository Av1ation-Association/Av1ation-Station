import { h } from 'vue';
import {
    // NButton,
    // NInput,
    // NInputGroup,
    NInputNumber,
    NSelect,
    // NSelect,
    // NSlider,
} from 'naive-ui';
import { Encoder } from '../../../../../shared/src/data/Types/Options';
import { type AOMEncoding } from '../../../../../shared/src/data/Types/Options';
import { type FormInputComponent } from '../library';
import { type ConfigurationType } from '../../../../../shared/src/data/Configuration';
import { useConfigurationsStore } from '../../../stores/configurations';

export function getComponents(): FormInputComponent[] {
    const configurationsStore = useConfigurationsStore<ConfigurationType.Task, Encoder.aom>();
    const parentAv1an = configurationsStore.parentAv1an;
    const previousAv1an = configurationsStore.previousDefaults.Av1an;

    const threads = {
        label: 'Threads',
        path: 'aom.threads',
        advanced: true,
        component: h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1an.encoding?.threads,
                clearable: true,
                min: 0,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.aom,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1an.encoding?.encoder === Encoder.aom && (parentAv1an.encoding as AOMEncoding).threads === value) {
                            delete configurationsStore.defaults.Av1an.encoding.threads;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.threads = value;
                        }
                    }
                },
                placeholder: parentAv1an.encoding?.encoder === Encoder.aom ? (parentAv1an.encoding as AOMEncoding)?.threads?.toString() ?? 'Maximum Threads' : 'Maximum Threads',
                
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.aom,
                };
            }
            configurationsStore.defaults.Av1an.encoding.threads = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.threads === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.threads;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.threads === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.threads !== undefined;
            } else if (previousAv1an.encoding.threads !== configurationsStore.defaults.Av1an.encoding?.threads) {
                return true;
            } else {
                return false;
            }
        },
    } satisfies FormInputComponent;

    const stereoMode = {
        label: 'Stereo Mode',
        path: 'aom.stereo-mode',
        advanced: true,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding?.['stereo-mode'],
                clearable: true,
                options: [
                    { label: 'Mono', value: 'mono' },
                    { label: 'Left-Right', value: 'left-right' },
                    { label: 'Bottom-Top', value: 'bottom-top' },
                    { label: 'Top-Bottom', value: 'top-bottom' },
                    { label: 'Right-Left', value: 'right-left' },
                ],
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.aom,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1an.encoding?.encoder === Encoder.aom && (parentAv1an.encoding as AOMEncoding)['stereo-mode'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['stereo-mode'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['stereo-mode'] = value;
                        }
                    } else {
                        delete configurationsStore.defaults.Av1an.encoding['stereo-mode'];
                    }
                },
                placeholder: parentAv1an.encoding?.encoder === Encoder.aom ? (parentAv1an.encoding as AOMEncoding)['stereo-mode'] === 'mono' ? 'Mono' : (parentAv1an.encoding as AOMEncoding)['stereo-mode'] === 'bottom-top' ? 'Bottom-Top' : (parentAv1an.encoding as AOMEncoding)['stereo-mode'] === 'top-bottom' ? 'Top-Bottom' : (parentAv1an.encoding as AOMEncoding)['stereo-mode'] === 'right-left' ? 'Right-Left' : 'Stereo Mode' : 'Stereo Mode',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['stereo-mode'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.aom,
                };
            }
            configurationsStore.defaults.Av1an.encoding['stereo-mode'] = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.['stereo-mode'] === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['stereo-mode'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['stereo-mode'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['stereo-mode'] !== undefined;
            } else if (previousAv1an.encoding['stereo-mode'] !== configurationsStore.defaults.Av1an.encoding?.['stereo-mode']) {
                return true;
            } else {
                return false;
            }
        },
    } satisfies FormInputComponent;

    const bitDepth = {
        label: 'Bit Depth',
        path: 'encoding.bit-depth',
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding?.['bit-depth'],
                clearable: true,
                options: [
                    { label: '8', value: 8 },
                    { label: '10', value: 10 },
                    { label: '12', value: 12 },
                ],
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.aom,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1an.encoding?.encoder === Encoder.aom && (parentAv1an.encoding as AOMEncoding)['bit-depth'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['bit-depth'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['bit-depth'] = value;
                        }
                    } else {
                        delete configurationsStore.defaults.Av1an.encoding['bit-depth'];
                    }
                },
                placeholder: parentAv1an.encoding?.encoder === Encoder.aom ? (parentAv1an.encoding as AOMEncoding)?.['bit-depth']?.toString() : '10',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['bit-depth'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.aom,
                };
            }
            configurationsStore.defaults.Av1an.encoding['bit-depth'] = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.['bit-depth'] === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['bit-depth'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['bit-depth'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['bit-depth'] !== undefined;
            } else if (previousAv1an.encoding['bit-depth'] !== configurationsStore.defaults.Av1an.encoding?.['bit-depth']) {
                return true;
            } else {
                return false;
            }
        },
    } satisfies FormInputComponent;

    const lagInFrames = {
        label: 'Lag in Frames',
        path: 'encoding.lag-in-frames',
        component: h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1an.encoding?.['lag-in-frames'],
                clearable: true,
                min: -2,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.aom,
                        };
                    }
    
                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding?.['lag-in-frames'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding?.['lag-in-frames'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['lag-in-frames'] = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding?.['lag-in-frames']?.toString() ?? '-2 (Auto: ~5 seconds)' :  '-2 (Auto: ~5 seconds)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['lag-in-frames'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }
    
            configurationsStore.defaults.Av1an.encoding['lag-in-frames'] = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.['lag-in-frames'] === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['lag-in-frames'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['lag-in-frames'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['lag-in-frames'] !== undefined;
            } else if (previousAv1an.encoding['lag-in-frames'] !== configurationsStore.defaults.Av1an.encoding?.['lag-in-frames']) {
                return true;
            } else {
                return false;
            }
        },
    };

    return [
        threads,
        stereoMode,
        bitDepth,
        lagInFrames,
    ];
}
