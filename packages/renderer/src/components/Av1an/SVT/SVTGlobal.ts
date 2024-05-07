import {
    type Ref,
    h,
} from 'vue';
import {
    NInputNumber,
    NSelect,
} from 'naive-ui';
import {
    type PartialChildren,
    type PartialAv1anConfiguration,
} from '../../Configuration/ConfigurationDefaults.vue';
import { type SVTEncoding, Encoder } from '../../../../../main/src/data/Av1an/Types/Options';
import { type FormInputComponent } from '../library';
import { type Task } from '../../../../../main/src/data/Configuration/Projects';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration | PartialChildren<Task['item']['Av1an']>>, parentAv1anValue?: PartialAv1anConfiguration): FormInputComponent[] {
    const tune = {
        label: 'Tune',
        path: 'encoding.tune',
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding)?.tune,
                clearable: true,
                options: [
                    { label: 'VQ (0)', value: 0 },
                    { label: 'PSNR (1)', value: 1 },
                    { label: 'SSIM (2)', value: 2 },
                    { label: 'Subjective SSIM (PSY Only) (3)', value: 3 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding).tune === value) {
                            delete (formValueRef.value.encoding as SVTEncoding).tune;
                        } else {
                            (formValueRef.value.encoding as SVTEncoding).tune = value;
                        }
                    }
                },
                placeholder: 'PSNR (1)',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)?.tune : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding).tune;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding).tune = null;
        },
        disabled: () => {
            return (formValueRef.value.encoding as SVTEncoding)?.tune === null;
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding).tune;
        },
    };

    const logicalProcessors = {
        label: 'Logical Processors',
        path: 'encoding.lp',
        component: h(
            NInputNumber,
            {
                value: (formValueRef.value.encoding as SVTEncoding)?.lp,
                clearable: true,
                min: 0,
                // defaultValue: formValueRef.value.threadAffinity ?? 0,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding).lp === value) {
                            delete (formValueRef.value.encoding as SVTEncoding).lp;
                        } else {
                            (formValueRef.value.encoding as SVTEncoding).lp = value;
                        }
                    }
                },
                placeholder: '0 (all)',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)?.lp : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding).lp;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding).lp = null;
        },
        disabled: () => {
            return (formValueRef.value.encoding as SVTEncoding)?.lp === null;
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding).lp;
        },
    };

    const inputDepth = {
        label: 'Input Depth',
        path: `encoding['input-depth']`,
        component: h(
            NSelect,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['input-depth'] : undefined,
                clearable: true,
                options: [
                    { label: '8-bit', value: 8 },
                    { label: '10-bit', value: 10 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['input-depth'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['input-depth'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['input-depth'] = value;
                        }
                    }
                },
                placeholder: '10',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['input-depth'] : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['input-depth'];
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['input-depth'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['input-depth']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['input-depth'];
        },
    };

    const skip = {
        label: 'Skip (Frames)',
        path: 'encoding.skip',
        component: h(
            NInputNumber,
            {
                value: (formValueRef.value.encoding as SVTEncoding)?.skip,
                clearable: true,
                min: 0,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding).skip === value) {
                            delete (formValueRef.value.encoding as SVTEncoding).skip;
                        } else {
                            (formValueRef.value.encoding as SVTEncoding).skip = value;
                        }
                    }
                },
                placeholder: '0',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)?.skip : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding).skip;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding).skip = null;
        },
        disabled: () => {
            return (formValueRef.value.encoding as SVTEncoding)?.skip === null;
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding).skip;
        },
    };

    const bufferedInput = {
        label: 'Buffered Input',
        path: 'encoding.nb',
        component: h(
            NInputNumber,
            {
                value: (formValueRef.value.encoding as SVTEncoding)?.nb,
                clearable: true,
                min: 0,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding).nb === value) {
                            delete (formValueRef.value.encoding as SVTEncoding).nb;
                        } else {
                            (formValueRef.value.encoding as SVTEncoding).nb = value;
                        }
                    }
                },
                placeholder: '0',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)?.nb : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding).nb;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding).nb = null;
        },
        disabled: () => {
            return (formValueRef.value.encoding as SVTEncoding)?.nb === null;
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding).nb;
        },
    };

    const hdr = {
        label: 'Enable High Dynamic Range',
        path: `encoding['enable-hdr']`,
        component: h(
            NSelect,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['enable-hdr'] : undefined,
                clearable: true,
                options: [
                    { label: 'No (0)', value: 0 },
                    { label: 'Yes (1)', value: 1 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['enable-hdr'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['enable-hdr'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['enable-hdr'] = value;
                        }
                    }
                },
                placeholder: 'No (0)',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['enable-hdr'] : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-hdr'];
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['enable-hdr'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['enable-hdr']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['enable-hdr'];
        },
    };


    const fps = {
        label: 'Framerate (FPS)',
        path: 'encoding.fps',
        component: h(
            NInputNumber,
            {
                value: (formValueRef.value.encoding as SVTEncoding)?.fps,
                clearable: true,
                min: 1,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding).fps === value) {
                            delete (formValueRef.value.encoding as SVTEncoding).fps;
                        } else {
                            (formValueRef.value.encoding as SVTEncoding).fps = value;
                        }
                    }
                },
                placeholder: 'Auto',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)?.fps : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding).fps;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding).fps = null;
        },
        disabled: () => {
            return (formValueRef.value.encoding as SVTEncoding)?.fps === null;
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding).fps;
        },
    };

    const enableStatReport = {
        label: 'Enable Stat Report',
        path: `encoding['enable-stat-report']`,
        component: h(
            NSelect,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['enable-stat-report'] : undefined,
                clearable: true,
                options: [
                    { label: 'No (0)', value: 0 },
                    { label: 'Yes (1)', value: 1 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['enable-stat-report'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['enable-stat-report'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['enable-stat-report'] = value;
                        }
                    }
                },
                placeholder: 'No (0)',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['enable-stat-report'] : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-stat-report'];
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['enable-stat-report'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['enable-stat-report']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['enable-stat-report'];
        },
    };

    const fastDecode = {
        label: 'Enable Fast Decode',
        path: `encoding['fast-decode']`,
        component: h(
            NSelect,
            {
                value: formValueRef.value.encoding ? (formValueRef.value.encoding as SVTEncoding)['fast-decode'] : undefined,
                clearable: true,
                options: [
                    { label: 'No (0)', value: 0 },
                    { label: 'Yes (1)', value: 1 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1anValue?.encoding?.encoder === Encoder.svt && (parentAv1anValue.encoding as SVTEncoding)['fast-decode'] === value) {
                            delete (formValueRef.value.encoding as SVTEncoding)['fast-decode'];
                        } else {
                            (formValueRef.value.encoding as SVTEncoding)['fast-decode'] = value;
                        }
                    }
                },
                placeholder: 'No (0)',
                defaultValue: parentAv1anValue?.encoding?.encoder === Encoder.svt ? (parentAv1anValue?.encoding as SVTEncoding)['fast-decode'] : undefined,
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['fast-decode'];
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.encoding) {
                formValueRef.value.encoding = {
                    encoder: Encoder.svt,
                };
            }

            (formValueRef.value.encoding as SVTEncoding)['fast-decode'] = null;
        },
        disabled: () => {
            return !!formValueRef.value.encoding && JSON.stringify((formValueRef.value.encoding as SVTEncoding)['fast-decode']) === JSON.stringify(null);
        },
        reset: () => {
            delete (formValueRef.value.encoding as SVTEncoding)['fast-decode'];
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