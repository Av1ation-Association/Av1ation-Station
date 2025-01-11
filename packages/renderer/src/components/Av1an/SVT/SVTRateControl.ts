import { h } from 'vue';
import {
    NSelect,
    NSlider,
    NSwitch,
} from 'naive-ui';
import { Encoder } from '../../../../../shared/src/data/Types/Options';
import { type ConfigurationType } from '../../../../../shared/src/data/Configuration';
import { useConfigurationsStore } from '../../../stores/configurations';
import { type FormInputComponent } from '../library';

export function getComponents(): FormInputComponent[] {
    const configurationsStore = useConfigurationsStore<ConfigurationType.Task, Encoder.svt>();
    const parentAv1an = configurationsStore.parentAv1an;
    const previousAv1an = configurationsStore.previousDefaults.Av1an;

    const crf = {
        label: 'Constant Rate Factor (CRF)',
        path: 'encoding.crf',
        component: h(
            NSlider,
            {
                value: configurationsStore.defaults.Av1an.encoding?.crf ?? undefined,
                min: 0,
                max: 63,
                step: 1,
                marks: {
                    35: 'Default',
                },
                defaultValue: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding?.crf ?? 35 : 35,
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding.crf === value) {
                            delete configurationsStore.defaults.Av1an.encoding.crf;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.crf = value;
                        }
                    }
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding.crf = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.crf === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.crf;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.crf === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.crf !== undefined;
            } else if (previousAv1an.encoding.crf !== configurationsStore.defaults.Av1an.encoding?.crf) {
                return true;
            } else {
                return false;
            }
        },
    };

    const aqMode = {
        label: 'Adaptive Quantization Mode',
        path: `encoding['aq-mode']`,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['aq-mode'] : undefined,
                clearable: true,
                options: [
                    { label: 'Off (0)', value: 0 },
                    { label: 'Variance base using AV1 segments (1)', value: 1 },
                    { label: 'DeltaQ Pred Efficiency (2)', value: 2 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['aq-mode'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['aq-mode'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['aq-mode'] = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['aq-mode'] === 0 ? 'Off (0)' : parentAv1an?.encoding['aq-mode'] === 1 ? 'Variance base using AV1 segments (1)' : 'DeltaQ Pred Efficiency (2)' : 'DeltaQ Pred Efficiency (2)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['aq-mode'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['aq-mode'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['aq-mode']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['aq-mode'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['aq-mode'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['aq-mode'] !== undefined;
            } else if (previousAv1an.encoding['aq-mode'] !== configurationsStore.defaults.Av1an.encoding?.['aq-mode']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const enableqm = {
        label: 'Enable Quantization Matrices',
        path: `encoding['enable-qm']`,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['enable-qm'] : undefined,
                clearable: true,
                options: [
                    { label: 'No (0)', value: 0 },
                    { label: 'Yes (1)', value: 1 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['enable-qm'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['enable-qm'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['enable-qm'] = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['enable-qm'] === 0 ? 'No (0)' : 'Yes (1)' : 'Yes (1)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['enable-qm'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['enable-qm'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['enable-qm']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['enable-qm'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['enable-qm'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['enable-qm'] !== undefined;
            } else if (previousAv1an.encoding['enable-qm'] !== configurationsStore.defaults.Av1an.encoding?.['enable-qm']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const qmMin = {
        label: 'Minimum Quant Matrix Flatness',
        path: `encoding['qm-min']`,
        component: h(
            NSlider,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['qm-min'] ?? undefined : undefined,
                min: 0,
                max: 15,
                step: 1,
                marks: {
                    0: 'Default',
                },
                defaultValue: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['qm-min'] ?? undefined : undefined,
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['qm-min'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['qm-min'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['qm-min'] = value;
                        }
                    }
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['qm-min'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['qm-min']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['qm-min'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['qm-min'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['qm-min'] !== undefined;
            } else if (previousAv1an.encoding['qm-min'] !== configurationsStore.defaults.Av1an.encoding?.['qm-min']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const qmMax = {
        label: 'Maximum Quant Matrix Flatness',
        path: `encoding['qm-max']`,
        component: h(
            NSlider,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['qm-max'] ?? undefined : undefined,
                min: 0,
                max: 15,
                step: 1,
                marks: {
                    15: 'Default',
                },
                defaultValue: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['qm-max'] ?? 15 : 15,
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['qm-max'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['qm-max'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['qm-max'] = value;
                        }
                    }
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['qm-max'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['qm-max']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['qm-max'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['qm-max'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['qm-max'] !== undefined;
            } else if (previousAv1an.encoding['qm-max'] !== configurationsStore.defaults.Av1an.encoding?.['qm-max']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const enableVarianceBoost = {
        label: 'Enable Variance Boost',
        path: `encoding['enable-variance-boost']`,
        component: h(
            NSwitch,
            {
                value: (configurationsStore.defaults.Av1an.encoding?.['enable-variance-boost'] ?? undefined) ? true : false,
                defaultValue: parentAv1an.encoding?.encoder === Encoder.svt ? parentAv1an.encoding['enable-variance-boost'] ? true : false : false,
                onUpdateValue: (value?: boolean) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1an.encoding?.encoder === Encoder.svt && parentAv1an.encoding['enable-variance-boost'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['enable-variance-boost'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['enable-variance-boost'] = value ? 1 : 0;
                        }
                    } else {
                        delete configurationsStore.defaults.Av1an.encoding['enable-variance-boost'];
                    }
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }
    
            configurationsStore.defaults.Av1an.encoding['enable-variance-boost'] = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.['enable-variance-boost'] === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['enable-variance-boost'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['enable-variance-boost'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['enable-variance-boost'] !== undefined;
            } else if (previousAv1an.encoding['enable-variance-boost'] !== configurationsStore.defaults.Av1an.encoding?.['enable-variance-boost']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const varianceBoostStrength = {
        label: 'Variance Boost Strength',
        path: `encoding['variance-boost-strength']`,
        component: h(
            NSlider,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['variance-boost-strength'] ?? undefined : undefined,
                min: 1,
                max: 4,
                step: 1,
                marks: {
                    2: 'Default',
                },
                defaultValue: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['variance-boost-strength'] ?? 2 : 2,
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['variance-boost-strength'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['variance-boost-strength'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['variance-boost-strength'] = value;
                        }
                    }
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['variance-boost-strength'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['variance-boost-strength']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['variance-boost-strength'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['variance-boost-strength'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['variance-boost-strength'] !== undefined;
            } else if (previousAv1an.encoding['variance-boost-strength'] !== configurationsStore.defaults.Av1an.encoding?.['variance-boost-strength']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const varianceOctile = {
        label: 'Variance Octile',
        path: `encoding['variance-octile']`,
        component: h(
            NSlider,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['variance-octile'] ?? undefined : undefined,
                min: 1,
                max: 8,
                step: 1,
                marks: {
                    6: 'Default',
                },
                defaultValue: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['variance-octile'] ?? 6 : 6,
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['variance-octile'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['variance-octile'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['variance-octile'] = value;
                        }
                    }
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['variance-octile'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['variance-octile']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['variance-octile'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['variance-octile'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['variance-octile'] !== undefined;
            } else if (previousAv1an.encoding['variance-octile'] !== configurationsStore.defaults.Av1an.encoding?.['variance-octile']) {
                return true;
            } else {
                return false;
            }
        },
    };

    return [
        crf,
        aqMode,
        enableqm,
        qmMin,
        qmMax,
        enableVarianceBoost,
        varianceBoostStrength,
        varianceOctile,
    ];
}
