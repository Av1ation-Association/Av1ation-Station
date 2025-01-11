import { h } from 'vue';
import {
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

    const filmGrain = {
        label: 'Film Grain',
        path: `encoding['film-grain']`,
        component: h(
            NSlider,
            {
                value: configurationsStore.defaults.Av1an.encoding?.['film-grain'] ?? undefined,
                min: 0,
                max: 50,
                step: 1,
                // marks: {
                //     0: 'Disabled',
                // },
                defaultValue: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['film-grain'] ?? undefined : undefined,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['film-grain'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['film-grain'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['film-grain'] = value;
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

            configurationsStore.defaults.Av1an.encoding['film-grain'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['film-grain']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['film-grain'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['film-grain'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['film-grain'] !== undefined;
            } else if (previousAv1an.encoding['film-grain'] !== configurationsStore.defaults.Av1an.encoding?.['film-grain']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const filmGrainDenoise = {
        label: 'Film Grain Denoise',
        path: `encoding['film-grain-denoise']`,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['film-grain-denoise'] : undefined,
                clearable: true,
                options: [
                    { label: 'Disabled', value: 0 },
                    { label: 'Enabled', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['film-grain-denoise'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['film-grain-denoise'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['film-grain-denoise'] = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['film-grain-denoise'] === 1 ? 'Enabled' : 'Disabled' : 'Disabled',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['film-grain-denoise'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['film-grain-denoise'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['film-grain-denoise']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['film-grain-denoise'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['film-grain-denoise'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['film-grain-denoise'] !== undefined;
            } else if (previousAv1an.encoding['film-grain-denoise'] !== configurationsStore.defaults.Av1an.encoding?.['film-grain-denoise']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const tileRows = {
        label: 'Tile Rows',
        path: `encoding['tile-rows']`,
        component: h(
            NSlider,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['tile-rows'] ?? undefined : undefined,
                min: 0,
                max: 6,
                step: 1,
                // marks: {
                //     0: 'Default (Resolution-dependent)',
                // },
                defaultValue: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['tile-rows'] ?? undefined : undefined,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['tile-rows'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['tile-rows'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['tile-rows'] = value;
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

            configurationsStore.defaults.Av1an.encoding['tile-rows'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['tile-rows']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['tile-rows'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['tile-rows'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['tile-rows'] !== undefined;
            } else if (previousAv1an.encoding['tile-rows'] !== configurationsStore.defaults.Av1an.encoding?.['tile-rows']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const tileColumns = {
        label: 'Tile Columns',
        path: `encoding['tile-columns']`,
        component: h(
            NSlider,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['tile-columns'] ?? undefined : undefined,
                min: 0,
                max: 4,
                step: 1,
                // marks: {
                //     0: 'Default (Resolution-dependent)',
                // },
                defaultValue: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['tile-columns'] ?? undefined : undefined,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['tile-columns'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['tile-columns'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['tile-columns'] = value;
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

            configurationsStore.defaults.Av1an.encoding['tile-columns'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['tile-columns']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['tile-columns'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['tile-columns'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['tile-columns'] !== undefined;
            } else if (previousAv1an.encoding['tile-columns'] !== configurationsStore.defaults.Av1an.encoding?.['tile-columns']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const enableDlf = {
        label: 'Deblocking Loop Filter',
        path: `encoding['enable-dlf']`,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['enable-dlf'] : undefined,
                clearable: true,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                    { label: 'Improved (2) (PSY Only)', value: 2 },
                ],
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['enable-dlf'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['enable-dlf'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['enable-dlf'] = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['enable-dlf'] === 2 ? 'Improved (2) (PSY Only)' : parentAv1an?.encoding['enable-dlf'] === 0 ? 'Disabled (0)' : 'Enabled (1)' : 'Enabled (1)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['enable-dlf'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['enable-dlf'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['enable-dlf']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['enable-dlf'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['enable-dlf'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['enable-dlf'] !== undefined;
            } else if (previousAv1an.encoding['enable-dlf'] !== configurationsStore.defaults.Av1an.encoding?.['enable-dlf']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const enableCdef = {
        label: 'Constrained Directional Enhancement Filter',
        path: `encoding['enable-cdef']`,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['enable-cdef'] : undefined,
                clearable: true,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['enable-cdef'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['enable-cdef'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['enable-cdef'] = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['enable-cdef'] === 0 ? 'Disabled (0)' : 'Enabled (1)' : 'Enabled (1)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['enable-cdef'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['enable-cdef'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['enable-cdef']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['enable-cdef'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['enable-cdef'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['enable-cdef'] !== undefined;
            } else if (previousAv1an.encoding['enable-cdef'] !== configurationsStore.defaults.Av1an.encoding?.['enable-cdef']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const enableRestoration = {
        label: 'Loop Restoration Filter',
        path: `encoding['enable-restoration']`,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['enable-restoration'] : undefined,
                clearable: true,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['enable-restoration'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['enable-restoration'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['enable-restoration'] = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['enable-restoration'] === 0 ? 'Disabled (0)' : 'Enabled (1)' : 'Enabled (1)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['enable-restoration'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['enable-restoration'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['enable-restoration']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['enable-restoration'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['enable-restoration'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['enable-restoration'] !== undefined;
            } else if (previousAv1an.encoding['enable-restoration'] !== configurationsStore.defaults.Av1an.encoding?.['enable-restoration']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const enableTpl = {
        label: 'Temporal Dependency Model',
        path: `encoding['enable-tpl-la']`,
        advanced: true,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['enable-tpl-la'] : undefined,
                clearable: true,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['enable-tpl-la'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['enable-tpl-la'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['enable-tpl-la'] = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['enable-tpl-la'] === 0 ? 'Disabled (0)' : 'Enabled (1)' : 'Enabled (1)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['enable-tpl-la'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['enable-tpl-la'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['enable-tpl-la']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['enable-tpl-la'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['enable-tpl-la'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['enable-tpl-la'] !== undefined;
            } else if (previousAv1an.encoding['enable-tpl-la'] !== configurationsStore.defaults.Av1an.encoding?.['enable-tpl-la']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const enableMfmv = {
        label: 'Motion Field Motion Vector',
        path: `encoding['enable-mfmv']`,
        advanced: true,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['enable-mfmv'] : undefined,
                clearable: true,
                options: [
                    { label: 'Auto (-1)', value: -1 },
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['enable-mfmv'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['enable-mfmv'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['enable-mfmv'] = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['enable-mfmv'] === 0 ? 'Disabled (0)' : parentAv1an?.encoding['enable-mfmv'] === 1 ? 'Enabled (1)' : 'Auto (-1)' : 'Auto (-1)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['enable-mfmv'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['enable-mfmv'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['enable-mfmv']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['enable-mfmv'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['enable-mfmv'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['enable-mfmv'] !== undefined;
            } else if (previousAv1an.encoding['enable-mfmv'] !== configurationsStore.defaults.Av1an.encoding?.['enable-mfmv']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const enableTf = {
        label: 'ALT-REF (Temporally Filtered) Frames',
        path: `encoding['enable-tf']`,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['enable-tf'] : undefined,
                clearable: true,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['enable-tf'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['enable-tf'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['enable-tf'] = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['enable-tf'] === 0 ? 'Disabled (0)' : 'Enabled (1)' : 'Enabled (1)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['enable-tf'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['enable-tf'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['enable-tf']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['enable-tf'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['enable-tf'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['enable-tf'] !== undefined;
            } else if (previousAv1an.encoding['enable-tf'] !== configurationsStore.defaults.Av1an.encoding?.['enable-tf']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const enableOverlays = {
        label: 'Overlays',
        path: `encoding['enable-overlays']`,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['enable-overlays'] : undefined,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['enable-overlays'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['enable-overlays'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['enable-overlays'] = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['enable-overlays'] === 1 ? 'Enabled (1)' : 'Disabled (0)' : 'Disabled (0)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['enable-overlays'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['enable-overlays'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['enable-overlays']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['enable-overlays'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['enable-overlays'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['enable-overlays'] !== undefined;
            } else if (previousAv1an.encoding['enable-overlays'] !== configurationsStore.defaults.Av1an.encoding?.['enable-overlays']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const enableScm = {
        label: 'Screen Content Detection Level (scm)',
        path: `encoding.scm`,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['scm'] : undefined,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['scm'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['scm'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['scm'] = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['scm'] === 1 ? 'Enabled (1)' : 'Disabled (0)' : 'Disabled (0)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['scm'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['scm'] = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.scm === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['scm'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.scm === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.scm !== undefined;
            } else if (previousAv1an.encoding.scm !== configurationsStore.defaults.Av1an.encoding?.scm) {
                return true;
            } else {
                return false;
            }
        },
    };

    return [
        filmGrain,
        filmGrainDenoise,
        tileRows,
        tileColumns,
        enableDlf,
        enableCdef,
        enableRestoration,
        enableTpl,
        enableMfmv,
        enableTf,
        enableOverlays,
        enableScm,
    ];
}
