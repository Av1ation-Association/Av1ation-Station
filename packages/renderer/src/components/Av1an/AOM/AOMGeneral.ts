import { h } from 'vue';
import {
    NButton,
    NInput,
    NInputGroup,
    NSelect,
    NSlider,
    NSwitch,
} from 'naive-ui';
import { type AOMEncoding, Encoder } from '../../../../../shared/src/data/Types/Options';
import { type FormInputComponent } from '../library';
import { type ConfigurationType } from '../../../../../shared/src/data/Configuration';
import { useConfigurationsStore } from '../../../stores/configurations';

export function getComponents(): FormInputComponent[] {
    const configurationsStore = useConfigurationsStore<ConfigurationType.Task, Encoder.aom>();
    const parentAv1an = configurationsStore.defaults.Av1an;
    const previousAv1an = configurationsStore.previousDefaults.Av1an;

    const config = {
        label: 'Config',
        path: 'encoding.cfg',
        advanced: true,
        component: h(
            NInputGroup,
            undefined,
            () => [
                h(
                    NInput,
                    {
                        value: configurationsStore.defaults.Av1an.encoding?.cfg,
                        clearable: true,
                        onUpdateValue: (value?: string) => {
                            if (!configurationsStore.defaults.Av1an.encoding) {
                                configurationsStore.defaults.Av1an.encoding = {
                                    encoder: Encoder.aom,
                                };
                            }
                            if (value !== null) {
                                if (parentAv1an.encoding?.encoder === Encoder.aom && (parentAv1an.encoding as AOMEncoding).cfg === value) {
                                    delete configurationsStore.defaults.Av1an.encoding.cfg;
                                } else {
                                    configurationsStore.defaults.Av1an.encoding.cfg = value;
                                }
                            }
                        },
                        placeholder: parentAv1an.encoding?.encoder === Encoder.aom ? (parentAv1an.encoding as AOMEncoding)?.cfg ?? 'Config File Path' : 'Config File Path',
                        onClear: () => {
                            delete configurationsStore.defaults.Av1an.encoding?.cfg;
                        },
                    },
                ),
                h(
                    NButton,
                    {
                        type: 'primary',
                        onClick: async () => {
                            const defaultPath = configurationsStore.defaults.Av1an.encoding?.cfg; // TODO: fallback to output directory
                            const configFilePath = await window.configurationsApi['save-file'](defaultPath ?? undefined, 'Config File');
                            if (configFilePath) {
                                if (!configurationsStore.defaults.Av1an.encoding) {
                                    configurationsStore.defaults.Av1an.encoding = {
                                        encoder: Encoder.aom,
                                    };
                                }
                                configurationsStore.defaults.Av1an.encoding.cfg = configFilePath;
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
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.aom,
                };
            }

            configurationsStore.defaults.Av1an.encoding.cfg = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.cfg === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.cfg;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.cfg === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.cfg !== undefined;
            } else if (previousAv1an.encoding.cfg !== configurationsStore.defaults.Av1an.encoding?.cfg) {
                return true;
            } else {
                return false;
            }
        },
    } satisfies FormInputComponent;

    const passes = {
        label: 'Passes',
        path: 'encoding.passes',
        component: h(
            NSlider,
            {
                value: configurationsStore.defaults.Av1an.encoding?.passes ?? undefined,
                min: 1,
                max: 3,
                step: 1,
                // defaultValue: parentAv1an.encoding?.encoder === Encoder.aom ? (parentAv1an.encoding as AOMEncoding)?.passes ?? 1 : 1,
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.aom,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1an.encoding?.encoder === Encoder.aom && (parentAv1an.encoding as AOMEncoding).passes === value) {
                            delete configurationsStore.defaults.Av1an.encoding.passes;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.passes = value as AOMEncoding['passes'];
                        }
                    }
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.aom,
                };
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
    } satisfies FormInputComponent;

    const pass = {
        label: 'Pass',
        path: 'encoding.pass',
        advanced: true,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding?.pass,
                clearable: true,
                options: [
                    { label: '1', value: 1 },
                    { label: '2', value: 2 },
                    { label: '3', value: 3 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.aom,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1an.encoding?.encoder === Encoder.aom && (parentAv1an.encoding as AOMEncoding).pass === value) {
                            delete configurationsStore.defaults.Av1an.encoding.pass;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.pass = value as AOMEncoding['pass'];
                        }
                    }
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.aom,
                };
            }

            configurationsStore.defaults.Av1an.encoding.pass = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.pass === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.pass;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.pass === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.pass !== undefined;
            } else if (previousAv1an.encoding.pass !== configurationsStore.defaults.Av1an.encoding?.pass) {
                return true;
            } else {
                return false;
            }
        },
    } satisfies FormInputComponent;

    const firstPassStatistics = {
        label: 'First Pass Statistics',
        path: 'encoding.fpf',
        advanced: true,
        component: h(
            NInput,
            {
                value: configurationsStore.defaults.Av1an.encoding?.fpf,
                clearable: true,
                onUpdateValue: (value?: string) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.aom,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1an.encoding?.encoder === Encoder.aom && (parentAv1an.encoding as AOMEncoding).fpf === value) {
                            delete configurationsStore.defaults.Av1an.encoding.fpf;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.fpf = value;
                        }
                    }
                },
                placeholder: parentAv1an.encoding?.encoder === Encoder.aom ? (parentAv1an.encoding as AOMEncoding)?.fpf ?? 'First Pass Statistics File Name' : 'First Pass Statistics File Name',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.fpf;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.aom,
                };
            }

            configurationsStore.defaults.Av1an.encoding.fpf = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.fpf === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.fpf;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.fpf === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.fpf !== undefined;
            } else if (previousAv1an.encoding.fpf !== configurationsStore.defaults.Av1an.encoding?.fpf) {
                return true;
            } else {
                return false;
            }
        },
    } satisfies FormInputComponent;

    const goodQualityDeadline = {
        label: 'Good Quality Deadline',
        path: 'encoding.good',
        advanced: true,
        component: h(
            NSwitch,
            {
                value: configurationsStore.defaults.Av1an.encoding?.good ?? undefined,
                defaultValue: parentAv1an.encoding?.encoder === Encoder.aom ? parentAv1an.encoding.good ? true : false : false,
                onUpdateValue: (value?: boolean) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.aom,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1an.encoding?.encoder === Encoder.aom && (parentAv1an.encoding as AOMEncoding).good === value) {
                            delete configurationsStore.defaults.Av1an.encoding.good;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.good = value;
                        }
                    } else {
                        delete configurationsStore.defaults.Av1an.encoding.good;
                    }
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.aom,
                };
            }

            configurationsStore.defaults.Av1an.encoding.good = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.good === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.good;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.good === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.good !== undefined;
            } else if (previousAv1an.encoding.good !== configurationsStore.defaults.Av1an.encoding?.good) {
                return true;
            } else {
                return false;
            }
        },
    } satisfies FormInputComponent;

    const realtimeQualityDeadline = {
        label: 'Realtime Quality Deadline',
        path: 'encoding.rt',
        advanced: true,
        component: h(
            NSwitch,
            {
                value: configurationsStore.defaults.Av1an.encoding?.rt ?? undefined,
                defaultValue: parentAv1an.encoding?.encoder === Encoder.aom ? parentAv1an.encoding.rt ? true : false : false,
                onUpdateValue: (value?: boolean) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.aom,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1an.encoding?.encoder === Encoder.aom && (parentAv1an.encoding as AOMEncoding).rt === value) {
                            delete configurationsStore.defaults.Av1an.encoding.rt;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.rt = value;
                        }
                    } else {
                        delete configurationsStore.defaults.Av1an.encoding.rt;
                    }
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.aom,
                };
            }

            configurationsStore.defaults.Av1an.encoding.rt = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.rt === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.rt;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.rt === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.rt !== undefined;
            } else if (previousAv1an.encoding.rt !== configurationsStore.defaults.Av1an.encoding?.rt) {
                return true;
            } else {
                return false;
            }
        },
    } satisfies FormInputComponent;

    const allIntra = {
        label: 'All Intra Mode',
        path: 'encoding.allintra',
        advanced: true,
        component: h(
            NSwitch,
            {
                value: configurationsStore.defaults.Av1an.encoding?.allintra ?? undefined,
                defaultValue: parentAv1an.encoding?.encoder === Encoder.aom ? parentAv1an.encoding.allintra ? true : false : false,
                onUpdateValue: (value?: boolean) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.aom,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1an.encoding?.encoder === Encoder.aom && (parentAv1an.encoding as AOMEncoding).allintra === value) {
                            delete configurationsStore.defaults.Av1an.encoding.allintra;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.allintra = value;
                        }
                    } else {
                        delete configurationsStore.defaults.Av1an.encoding.allintra;
                    }
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.aom,
                };
            }

            configurationsStore.defaults.Av1an.encoding.allintra = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.allintra === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.allintra;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.allintra === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.allintra !== undefined;
            } else if (previousAv1an.encoding.allintra !== configurationsStore.defaults.Av1an.encoding?.allintra) {
                return true;
            } else {
                return false;
            }
        },
    } satisfies FormInputComponent;

    return [
        config,
        passes,
        pass,
        firstPassStatistics,
        goodQualityDeadline,
        realtimeQualityDeadline,
        allIntra,
    ];
}
