import { h } from 'vue';
import {
    NInputNumber,
    NSelect,
    NSlider,
} from 'naive-ui';
import { type ConfigurationType } from '../../../../../shared/src/data/Configuration';
import { Encoder } from '../../../../../shared/src/data/Types/Options';
import { useConfigurationsStore } from '../../../stores/configurations';
import { type FormInputComponent } from '../library';

export function getComponents(): FormInputComponent[] {
    const configurationsStore = useConfigurationsStore<ConfigurationType.Task, Encoder.svt>();
    const parentAv1an = configurationsStore.parentAv1an;
    const previousAv1an = configurationsStore.previousDefaults.Av1an;

    const profile = {
        label: 'Profile',
        path: 'encoding.profile',
        advanced: true,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding?.profile,
                clearable: true,
                options: [
                    { label: 'Main (0)', value: 0 },
                    { label: 'High (1)', value: 1 },
                    { label: 'Professional (2)', value: 2 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding.tune === value) {
                            delete configurationsStore.defaults.Av1an.encoding.tune;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.tune = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding?.profile === 0 ? 'Main (0)' : parentAv1an?.encoding?.profile === 1 ? 'High (1)' : parentAv1an?.encoding?.profile === 2 ? 'Professional (2)' : 'Main (0)' : 'Main (0)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.profile;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding.profile = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.profile === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.profile;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.profile === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.profile !== undefined;
            } else if (previousAv1an.encoding.profile !== configurationsStore.defaults.Av1an.encoding?.profile) {
                return true;
            } else {
                return false;
            }
        },
    };

    const tune = {
        label: 'Tune',
        path: 'encoding.tune',
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding?.tune,
                clearable: true,
                options: [
                    { label: 'VQ (0)', value: 0 },
                    { label: 'PSNR (1)', value: 1 },
                    { label: 'SSIM (2)', value: 2 },
                    { label: 'Subjective SSIM (PSY Only) (3)', value: 3 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding.tune === value) {
                            delete configurationsStore.defaults.Av1an.encoding.tune;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.tune = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding?.tune === 0 ? 'VQ (0)' : parentAv1an?.encoding?.tune === 1 ? 'PSNR (1)' : parentAv1an?.encoding?.tune === 2 ? 'SSIM (2)' : parentAv1an?.encoding?.tune === 3 ? 'Subjective SSIM (PSY Only) (3)' : 'PSNR (1)' : 'PSNR (1)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.tune;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding.tune = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.tune === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.tune;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.tune === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.tune !== undefined;
            } else if (previousAv1an.encoding.tune !== configurationsStore.defaults.Av1an.encoding?.tune) {
                return true;
            } else {
                return false;
            }
        },
    };

    const levelOfParallelism = {
        label: 'Level of Parallelism',
        path: 'encoding.lp',
        component: h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1an.encoding?.lp,
                clearable: true,
                min: 0,
                max: 6,
                // defaultValue: configurationsStore.defaults.Av1an.threadAffinity ?? 0,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding.lp === value) {
                            delete configurationsStore.defaults.Av1an.encoding.lp;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.lp = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding?.lp?.toString() ?? 'Based on CPU Core Count' : 'Based on CPU Core Count',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.lp;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding.lp = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.lp === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.lp;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.lp === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.lp !== undefined;
            } else if (previousAv1an.encoding.lp !== configurationsStore.defaults.Av1an.encoding?.lp) {
                return true;
            } else {
                return false;
            }
        },
    };

    const inputDepth = {
        label: 'Input Depth',
        path: `encoding['input-depth']`,
        advanced: true,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['input-depth'] : undefined,
                clearable: true,
                options: [
                    { label: '8-bit', value: 8 },
                    { label: '10-bit', value: 10 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['input-depth'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['input-depth'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['input-depth'] = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['input-depth']?.toString() ?? '10' : '10',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['input-depth'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['input-depth'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['input-depth']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['input-depth'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['input-depth'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['input-depth'] !== undefined;
            } else if (previousAv1an.encoding['input-depth'] !== configurationsStore.defaults.Av1an.encoding?.['input-depth']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const skip = {
        label: 'Skip (Frames)',
        path: 'encoding.skip',
        advanced: true,
        component: h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1an.encoding?.skip,
                clearable: true,
                min: 0,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding.skip === value) {
                            delete configurationsStore.defaults.Av1an.encoding.skip;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.skip = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding?.skip?.toString() ?? '0' : '0',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.skip;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding.skip = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.skip === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.skip;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.skip === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.skip !== undefined;
            } else if (previousAv1an.encoding.skip !== configurationsStore.defaults.Av1an.encoding?.skip) {
                return true;
            } else {
                return false;
            }
        },
    };

    const bufferedInput = {
        label: 'Buffered Input',
        path: 'encoding.nb',
        advanced: true,
        component: h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1an.encoding?.nb,
                clearable: true,
                min: 0,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding.nb === value) {
                            delete configurationsStore.defaults.Av1an.encoding.nb;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.nb = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding?.nb?.toString() ?? '0' : '0',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.nb;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding.nb = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.nb === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.nb;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.nb === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.nb !== undefined;
            } else if (previousAv1an.encoding.nb !== configurationsStore.defaults.Av1an.encoding?.nb) {
                return true;
            } else {
                return false;
            }
        },
    };

    const hdr = {
        label: 'Enable High Dynamic Range',
        path: `encoding['enable-hdr']`,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['enable-hdr'] : undefined,
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
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['enable-hdr'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['enable-hdr'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['enable-hdr'] = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['enable-hdr'] === 1 ? 'Yes (1)' : 'No (0)' : 'No (0)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['enable-hdr'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['enable-hdr'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['enable-hdr']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['enable-hdr'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['enable-hdr'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['enable-hdr'] !== undefined;
            } else if (previousAv1an.encoding['enable-hdr'] !== configurationsStore.defaults.Av1an.encoding?.['enable-hdr']) {
                return true;
            } else {
                return false;
            }
        },
    };


    const fps = {
        label: 'Framerate (FPS)',
        path: 'encoding.fps',
        advanced: true,
        component: h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1an.encoding?.fps,
                clearable: true,
                min: 1,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding.fps === value) {
                            delete configurationsStore.defaults.Av1an.encoding.fps;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.fps = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding?.fps?.toString() ?? 'Auto' : 'Auto',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.fps;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding.fps = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.fps === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.fps;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.fps === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.fps !== undefined;
            } else if (previousAv1an.encoding.fps !== configurationsStore.defaults.Av1an.encoding?.fps) {
                return true;
            } else {
                return false;
            }
        },
    };

    const enableStatReport = {
        label: 'Enable Stat Report',
        path: `encoding['enable-stat-report']`,
        advanced: true,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['enable-stat-report'] : undefined,
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
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['enable-stat-report'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['enable-stat-report'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['enable-stat-report'] = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['enable-stat-report'] === 1 ? 'Yes (1)' : 'No (0)' : 'No (0)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['enable-stat-report'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['enable-stat-report'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['enable-stat-report']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['enable-stat-report'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['enable-stat-report'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['enable-stat-report'] !== undefined;
            } else if (previousAv1an.encoding['enable-stat-report'] !== configurationsStore.defaults.Av1an.encoding?.['enable-stat-report']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const fastDecode = {
        label: 'Fast Decode',
        path: `encoding['fast-decode']`,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['fast-decode'] : undefined,
                clearable: true,
                options: [
                    { label: 'Off (0)', value: 0 },
                    { label: 'Fast (1)', value: 1 },
                    { label: 'Faster (2)', value: 2 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['fast-decode'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['fast-decode'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['fast-decode'] = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['fast-decode'] === 1 ? 'Fast (1)' : parentAv1an.encoding['fast-decode'] === 2 ? 'Faster (2)' : 'Off (0)' : 'Off (0)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['fast-decode'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['fast-decode'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['fast-decode']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['fast-decode'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['fast-decode'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['fast-decode'] !== undefined;
            } else if (previousAv1an.encoding['fast-decode'] !== configurationsStore.defaults.Av1an.encoding?.['fast-decode']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const max32TxSize = {
        label: 'Maximum 32x32 Block Transform Size (PSY Only)',
        path: `encoding['max-32-tx-size']`,
        advanced: true,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['max-32-tx-size'] : undefined,
                clearable: true,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['max-32-tx-size'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['max-32-tx-size'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['max-32-tx-size'] = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['max-32-tx-size'] === 1 ? 'Enabled (1)' : 'Disabled (0)' : 'Disabled (0)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['max-32-tx-size'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['max-32-tx-size'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['max-32-tx-size']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['max-32-tx-size'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['max-32-tx-size'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['max-32-tx-size'] !== undefined;
            } else if (previousAv1an.encoding['max-32-tx-size'] !== configurationsStore.defaults.Av1an.encoding?.['max-32-tx-size']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const noiseNormStrength = {
        label: 'Noise Norm Strength (PSY Only)',
        path: `encoding['noise-norm-strength']`,
        advanced: true,
        component: h(
            NSlider,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['noise-norm-strength'] ?? undefined : undefined,
                min: 0,
                max: 4,
                step: 1,
                defaultValue: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['noise-norm-strength'] ?? 0 : 0,
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }
    
                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['noise-norm-strength'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['noise-norm-strength'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['noise-norm-strength'] = value;
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
    
            configurationsStore.defaults.Av1an.encoding['noise-norm-strength'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['noise-norm-strength']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['noise-norm-strength'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['noise-norm-strength'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['noise-norm-strength'] !== undefined;
            } else if (previousAv1an.encoding['noise-norm-strength'] !== configurationsStore.defaults.Av1an.encoding?.['noise-norm-strength']) {
                return true;
            } else {
                return false;
            }
        },
    };

    return [
        profile,
        tune,
        levelOfParallelism,
        inputDepth,
        skip,
        bufferedInput,
        hdr,
        fps,
        enableStatReport,
        fastDecode,
        max32TxSize,
        noiseNormStrength,
    ];
}
