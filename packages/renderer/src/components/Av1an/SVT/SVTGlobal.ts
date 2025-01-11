import { h } from 'vue';
import {
    NInputNumber,
    NSelect,
} from 'naive-ui';
import { type ConfigurationType } from '../../../../../shared/src/data/Configuration';
import { Encoder } from '../../../../../shared/src/data/Types/Options';
import { useConfigurationsStore } from '../../../stores/configurations';
import { type FormInputComponent } from '../library';

export function getComponents(): FormInputComponent[] {
    const configurationsStore = useConfigurationsStore<ConfigurationType.Task, Encoder.svt>();
    const parentAv1an = configurationsStore.parentAv1an;
    const previousAv1an = configurationsStore.previousDefaults.Av1an;

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

    const logicalProcessors = {
        label: 'Logical Processors',
        path: 'encoding.lp',
        component: h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1an.encoding?.lp,
                clearable: true,
                min: 0,
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
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding?.lp?.toString() ?? '0 (all)' : '0 (all)',
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
        label: 'Enable Fast Decode',
        path: `encoding['fast-decode']`,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['fast-decode'] : undefined,
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
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['fast-decode'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['fast-decode'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['fast-decode'] = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['fast-decode'] === 1 ? 'Yes (1)' : 'No (0)' : 'No (0)',
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
