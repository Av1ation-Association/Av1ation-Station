import {
    type Ref,
    h,
} from 'vue';
import {
    NSelect,
    NSlider,
} from 'naive-ui';
import {
    type PartialChildren,
    type PartialAv1anConfiguration,
} from '../../Configuration/ConfigurationDefaults.vue';
import { type SVTEncoding, Encoder } from '../../../../../main/src/data/Av1an/Types/Options';
import { type FormInputComponent } from '../library';
import { type Task } from '../../../../../main/src/data/Configuration/Projects';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration | PartialChildren<Task['item']['Av1an']>>, parentAv1anValue?: PartialAv1anConfiguration): FormInputComponent[] {
    const filmGrain = {
        label: 'Film Grain',
        path: `encoding['film-grain']`,
        component: h(
            NSlider,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['film-grain'] ?? undefined : undefined,
                min: 0,
                max: 50,
                step: 1,
                // marks: {
                //     0: 'Disabled',
                // },
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['film-grain'] ?? undefined : undefined,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['film-grain'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['film-grain'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['film-grain'] = value;
                        }
                    }
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['film-grain'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['film-grain']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['film-grain'];
        },
    };

    const filmGrainDenoise = {
        label: 'Film Grain Denoise',
        path: `encoding['film-grain-denoise']`,
        component: h(
            NSelect,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['film-grain-denoise'] : undefined,
                clearable: true,
                options: [
                    { label: 'Disabled', value: 0 },
                    { label: 'Enabled', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['film-grain-denoise'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['film-grain-denoise'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['film-grain-denoise'] = value;
                        }
                    }
                },
                placeholder: 'Disabled',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['film-grain-denoise'] : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['film-grain-denoise'];
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['film-grain-denoise'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['film-grain-denoise']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['film-grain-denoise'];
        },
    };

    const tileRows = {
        label: 'Tile Rows',
        path: `encoding['tile-rows']`,
        component: h(
            NSlider,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['tile-rows'] ?? undefined : undefined,
                min: 0,
                max: 6,
                step: 1,
                // marks: {
                //     0: 'Default (Resolution-dependent)',
                // },
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['tile-rows'] ?? undefined : undefined,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['tile-rows'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['tile-rows'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['tile-rows'] = value;
                        }
                    }
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['tile-rows'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['tile-rows']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['tile-rows'];
        },
    };

    const tileColumns = {
        label: 'Tile Columns',
        path: `encoding['tile-columns']`,
        component: h(
            NSlider,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['tile-columns'] ?? undefined : undefined,
                min: 0,
                max: 4,
                step: 1,
                // marks: {
                //     0: 'Default (Resolution-dependent)',
                // },
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['tile-columns'] ?? undefined : undefined,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['tile-columns'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['tile-columns'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['tile-columns'] = value;
                        }
                    }
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['tile-columns'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['tile-columns']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['tile-columns'];
        },
    };

    const enableDlf = {
        label: 'Deblocking Loop Filter',
        path: `encoding['enable-dlf']`,
        component: h(
            NSelect,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['enable-dlf'] : undefined,
                clearable: true,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                    { label: 'Improved (2) (PSY Only)', value: 2 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['enable-dlf'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['enable-dlf'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['enable-dlf'] = value;
                        }
                    }
                },
                placeholder: 'Enabled (1)',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['enable-dlf'] : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-dlf'];
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['enable-dlf'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['enable-dlf']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['enable-dlf'];
        },
    };

    const enableCdef = {
        label: 'Constrained Directional Enhancement Filter',
        path: `encoding['enable-cdef']`,
        component: h(
            NSelect,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['enable-cdef'] : undefined,
                clearable: true,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['enable-cdef'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['enable-cdef'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['enable-cdef'] = value;
                        }
                    }
                },
                placeholder: 'Enabled (1)',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['enable-cdef'] : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-cdef'];
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['enable-cdef'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['enable-cdef']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['enable-cdef'];
        },
    };

    const enableRestoration = {
        label: 'Loop Restoration Filter',
        path: `encoding['enable-restoration']`,
        component: h(
            NSelect,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['enable-restoration'] : undefined,
                clearable: true,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['enable-restoration'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['enable-restoration'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['enable-restoration'] = value;
                        }
                    }
                },
                placeholder: 'Enabled (1)',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['enable-restoration'] : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-restoration'];
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['enable-restoration'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['enable-restoration']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['enable-restoration'];
        },
    };

    const enableTpl = {
        label: 'Temporal Dependency Model',
        path: `encoding['enable-tpl-la']`,
        advanced: true,
        component: h(
            NSelect,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['enable-tpl-la'] : undefined,
                clearable: true,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['enable-tpl-la'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['enable-tpl-la'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['enable-tpl-la'] = value;
                        }
                    }
                },
                placeholder: 'Enabled (1)',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['enable-tpl-la'] : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-tpl-la'];
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['enable-tpl-la'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['enable-tpl-la']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['enable-tpl-la'];
        },
    };

    const enableMfmv = {
        label: 'Motion Field Motion Vector',
        path: `encoding['enable-mfmv']`,
        advanced: true,
        component: h(
            NSelect,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['enable-mfmv'] : undefined,
                clearable: true,
                options: [
                    { label: 'Auto (-1)', value: -1 },
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['enable-mfmv'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['enable-mfmv'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['enable-mfmv'] = value;
                        }
                    }
                },
                placeholder: 'Auto (-1)',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['enable-mfmv'] : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-mfmv'];
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['enable-mfmv'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['enable-mfmv']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['enable-mfmv'];
        },
    };

    const enableTf = {
        label: 'ALT-REF (Temporally Filtered) Frames',
        path: `encoding['enable-tf']`,
        component: h(
            NSelect,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['enable-tf'] : undefined,
                clearable: true,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['enable-tf'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['enable-tf'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['enable-tf'] = value;
                        }
                    }
                },
                placeholder: 'Enabled (1)',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['enable-tf'] : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-tf'];
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['enable-tf'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['enable-tf']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['enable-tf'];
        },
    };

    const enableOverlays = {
        label: 'Overlays',
        path: `encoding['enable-overlays']`,
        component: h(
            NSelect,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['enable-overlays'] : undefined,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['enable-overlays'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['enable-overlays'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['enable-overlays'] = value;
                        }
                    }
                },
                placeholder: 'Disabled (0)',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['enable-overlays'] : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-overlays'];
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['enable-overlays'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['enable-overlays']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['enable-overlays'];
        },
    };

    const enableScm = {
        label: 'Scren Content Detection Level (scm)',
        path: `encoding['scm']`,
        component: h(
            NSelect,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['scm'] : undefined,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['scm'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['scm'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['scm'] = value;
                        }
                    }
                },
                placeholder: 'Disabled (0)',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['scm'] : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['scm'];
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['scm'] = null;
        },
        disabled: () => {
            return (formValueRef.value.encoding as SVTEncoding)?.scm === null;
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['scm'];
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