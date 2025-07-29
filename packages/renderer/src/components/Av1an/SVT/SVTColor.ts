import { h } from 'vue';
import {
    NInput,
    NSelect,
} from 'naive-ui';
import { Encoder } from '../../../../../shared/src/data/Types/Options';
import { type FormInputComponent } from '../library';
import { type ConfigurationType } from '../../../../../shared/src/data/Configuration';
import { useConfigurationsStore } from '../../../stores/configurations';
import { ChromaSamplePosition, ChromaSamplePositiontoString, ColorPrimaries, ColorPrimariestoString, ColorRange, ColorRangetoString, MatrixCoefficients, MatrixCoefficientsToString, TransferCharacteristics, TransferCharacteristicstoString } from '../../../../../shared/src/data/Types/SVT';

export function getComponents(): FormInputComponent[] {
    const configurationsStore = useConfigurationsStore<ConfigurationType.Task, Encoder.svt>();
    const parentAv1an = configurationsStore.parentAv1an;
    const previousAv1an = configurationsStore.previousDefaults.Av1an;

    const primaries = {
        label: 'Color Primaries',
        path: `encoding['color-primaries']`,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding?.['color-primaries'],
                clearable: true,
                options: [
                    { label: `${ColorPrimariestoString(ColorPrimaries.bt709)} (${ColorPrimaries.bt709})`, value: ColorPrimaries.bt709 },
                    { label: `${ColorPrimariestoString(ColorPrimaries.unspecified)} (${ColorPrimaries.unspecified})`, value: ColorPrimaries.unspecified },
                    { label: `${ColorPrimariestoString(ColorPrimaries.bt470m)} (${ColorPrimaries.bt470m})`, value: ColorPrimaries.bt470m },
                    { label: `${ColorPrimariestoString(ColorPrimaries.bt470bg)} (${ColorPrimaries.bt470bg})`, value: ColorPrimaries.bt470bg },
                    { label: `${ColorPrimariestoString(ColorPrimaries.bt601)} (${ColorPrimaries.bt601})`, value: ColorPrimaries.bt601 },
                    { label: `${ColorPrimariestoString(ColorPrimaries.smpte240)} (${ColorPrimaries.smpte240})`, value: ColorPrimaries.smpte240 },
                    { label: `${ColorPrimariestoString(ColorPrimaries.film)} (${ColorPrimaries.film})`, value: ColorPrimaries.film },
                    { label: `${ColorPrimariestoString(ColorPrimaries.bt2020)} (${ColorPrimaries.bt2020})`, value: ColorPrimaries.bt2020 },
                    { label: `${ColorPrimariestoString(ColorPrimaries.xyz)} (${ColorPrimaries.xyz})`, value: ColorPrimaries.xyz },
                    { label: `${ColorPrimariestoString(ColorPrimaries.smpte431)} (${ColorPrimaries.smpte431})`, value: ColorPrimaries.smpte431 },
                    { label: `${ColorPrimariestoString(ColorPrimaries.smpte432)} (${ColorPrimaries.smpte432})`, value: ColorPrimaries.smpte432 },
                    { label: `${ColorPrimariestoString(ColorPrimaries.ebu3213)} (${ColorPrimaries.ebu3213})`, value: ColorPrimaries.ebu3213 },
                ],
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1an.encoding?.encoder === Encoder.svt && parentAv1an.encoding['color-primaries'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['color-primaries'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['color-primaries'] = value;
                        }
                    }
                },
                placeholder: `${ColorPrimariestoString(parentAv1an.encoding?.['color-primaries'] ?? ColorPrimaries.unspecified)} (${parentAv1an.encoding?.['color-primaries'] ?? ColorPrimaries.unspecified})`,
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['color-primaries'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['color-primaries'] = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.['color-primaries'] === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['color-primaries'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['color-primaries'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['color-primaries'] !== undefined;
            } else if (previousAv1an.encoding['color-primaries'] !== configurationsStore.defaults.Av1an.encoding?.['color-primaries']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const transfer = {
        label: 'Transfer Characteristics',
        path: `encoding['transfer-characteristics']`,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding?.['transfer-characteristics'],
                clearable: true,
                options: [
                    { label: `${TransferCharacteristicstoString(TransferCharacteristics.bt709)} (${TransferCharacteristics.bt709})`, value: TransferCharacteristics.bt709 },
                    { label: `${TransferCharacteristicstoString(TransferCharacteristics.unspecified)} (${TransferCharacteristics.unspecified})`, value: TransferCharacteristics.unspecified },
                    { label: `${TransferCharacteristicstoString(TransferCharacteristics.bt470m)} (${TransferCharacteristics.bt470m})`, value: TransferCharacteristics.bt470m },
                    { label: `${TransferCharacteristicstoString(TransferCharacteristics.bt470bg)} (${TransferCharacteristics.bt470bg})`, value: TransferCharacteristics.bt470bg },
                    { label: `${TransferCharacteristicstoString(TransferCharacteristics.bt601)} (${TransferCharacteristics.bt601})`, value: TransferCharacteristics.bt601 },
                    { label: `${TransferCharacteristicstoString(TransferCharacteristics.smpte240)} (${TransferCharacteristics.smpte240})`, value: TransferCharacteristics.smpte240 },
                    { label: `${TransferCharacteristicstoString(TransferCharacteristics.linear)} (${TransferCharacteristics.linear})`, value: TransferCharacteristics.linear },
                    { label: `${TransferCharacteristicstoString(TransferCharacteristics.log100)} (${TransferCharacteristics.log100})`, value: TransferCharacteristics.log100 },
                    { label: `${TransferCharacteristicstoString(TransferCharacteristics.log100sqrt10)} (${TransferCharacteristics.log100sqrt10})`, value: TransferCharacteristics.log100sqrt10 },
                    { label: `${TransferCharacteristicstoString(TransferCharacteristics.iec61966)} (${TransferCharacteristics.iec61966})`, value: TransferCharacteristics.iec61966 },
                    { label: `${TransferCharacteristicstoString(TransferCharacteristics.bt1361)} (${TransferCharacteristics.bt1361})`, value: TransferCharacteristics.bt1361 },
                    { label: `${TransferCharacteristicstoString(TransferCharacteristics.srgb)} (${TransferCharacteristics.srgb})`, value: TransferCharacteristics.srgb },
                    { label: `${TransferCharacteristicstoString(TransferCharacteristics.bt202010)} (${TransferCharacteristics.bt202010})`, value: TransferCharacteristics.bt202010 },
                    { label: `${TransferCharacteristicstoString(TransferCharacteristics.bt202012)} (${TransferCharacteristics.bt202012})`, value: TransferCharacteristics.bt202012 },
                    { label: `${TransferCharacteristicstoString(TransferCharacteristics.smpte2084)} (${TransferCharacteristics.smpte2084})`, value: TransferCharacteristics.smpte2084 },
                    { label: `${TransferCharacteristicstoString(TransferCharacteristics.smpte428)} (${TransferCharacteristics.smpte428})`, value: TransferCharacteristics.smpte428 },
                    { label: `${TransferCharacteristicstoString(TransferCharacteristics.hlg)} (${TransferCharacteristics.hlg})`, value: TransferCharacteristics.hlg },
                ],
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1an.encoding?.encoder === Encoder.svt && parentAv1an.encoding['transfer-characteristics'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['transfer-characteristics'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['transfer-characteristics'] = value;
                        }
                    }
                },
                placeholder: `${TransferCharacteristicstoString(parentAv1an.encoding?.['transfer-characteristics'] ?? TransferCharacteristics.unspecified)} (${parentAv1an.encoding?.['transfer-characteristics'] ?? TransferCharacteristics.unspecified})`,
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['transfer-characteristics'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['transfer-characteristics'] = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.['transfer-characteristics'] === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['transfer-characteristics'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['transfer-characteristics'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['transfer-characteristics'] !== undefined;
            } else if (previousAv1an.encoding['transfer-characteristics'] !== configurationsStore.defaults.Av1an.encoding?.['transfer-characteristics']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const matrix = {
        label: 'Matrix Coefficients',
        path: `encoding['matrix-coefficients']`,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding?.['matrix-coefficients'],
                clearable: true,
                options: [
                    { label: `${MatrixCoefficientsToString(MatrixCoefficients.identity)} (${MatrixCoefficients.identity})`, value: MatrixCoefficients.identity },
                    { label: `${MatrixCoefficientsToString(MatrixCoefficients.bt709)} (${MatrixCoefficients.bt709})`, value: MatrixCoefficients.bt709 },
                    { label: `${MatrixCoefficientsToString(MatrixCoefficients.unspecified)} (${MatrixCoefficients.unspecified})`, value: MatrixCoefficients.unspecified },
                    { label: `${MatrixCoefficientsToString(MatrixCoefficients.fcc)} (${MatrixCoefficients.fcc})`, value: MatrixCoefficients.fcc },
                    { label: `${MatrixCoefficientsToString(MatrixCoefficients.bt470bg)} (${MatrixCoefficients.bt470bg})`, value: MatrixCoefficients.bt470bg },
                    { label: `${MatrixCoefficientsToString(MatrixCoefficients.bt601)} (${MatrixCoefficients.bt601})`, value: MatrixCoefficients.bt601 },
                    { label: `${MatrixCoefficientsToString(MatrixCoefficients.smpte240)} (${MatrixCoefficients.smpte240})`, value: MatrixCoefficients.smpte240 },
                    { label: `${MatrixCoefficientsToString(MatrixCoefficients.ycgco)} (${MatrixCoefficients.ycgco})`, value: MatrixCoefficients.ycgco },
                    { label: `${MatrixCoefficientsToString(MatrixCoefficients.bt2020ncl)} (${MatrixCoefficients.bt2020ncl})`, value: MatrixCoefficients.bt2020ncl },
                    { label: `${MatrixCoefficientsToString(MatrixCoefficients.bt2020cl)} (${MatrixCoefficients.bt2020cl})`, value: MatrixCoefficients.bt2020cl },
                    { label: `${MatrixCoefficientsToString(MatrixCoefficients.smpte2085)} (${MatrixCoefficients.smpte2085})`, value: MatrixCoefficients.smpte2085 },
                    { label: `${MatrixCoefficientsToString(MatrixCoefficients.chromancl)} (${MatrixCoefficients.chromancl})`, value: MatrixCoefficients.chromancl },
                    { label: `${MatrixCoefficientsToString(MatrixCoefficients.chromacl)} (${MatrixCoefficients.chromacl})`, value: MatrixCoefficients.chromacl },
                    { label: `${MatrixCoefficientsToString(MatrixCoefficients.ictcp)} (${MatrixCoefficients.ictcp})`, value: MatrixCoefficients.ictcp },
                ],
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1an.encoding?.encoder === Encoder.svt && parentAv1an.encoding['matrix-coefficients'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['matrix-coefficients'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['matrix-coefficients'] = value;
                        }
                    }
                },
                placeholder: `${MatrixCoefficientsToString(parentAv1an.encoding?.['matrix-coefficients'] ?? MatrixCoefficients.unspecified)} (${parentAv1an.encoding?.['matrix-coefficients'] ?? MatrixCoefficients.unspecified})`,
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['matrix-coefficients'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['matrix-coefficients'] = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.['matrix-coefficients'] === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['matrix-coefficients'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['matrix-coefficients'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['matrix-coefficients'] !== undefined;
            } else if (previousAv1an.encoding['matrix-coefficients'] !== configurationsStore.defaults.Av1an.encoding?.['matrix-coefficients']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const range = {
        label: 'Color Range',
        path: `encoding['color-range']`,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding?.['color-range'],
                clearable: true,
                options: [
                    { label: `${ColorRangetoString(ColorRange.studio)} (${ColorRange.studio})`, value: ColorRange.studio },
                    { label: `${ColorRangetoString(ColorRange.full)} (${ColorRange.full})`, value: ColorRange.full },
                ],
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1an.encoding?.encoder === Encoder.svt && parentAv1an.encoding['color-range'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['color-range'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['color-range'] = value;
                        }
                    }
                },
                placeholder: `${ColorRangetoString(parentAv1an.encoding?.['color-range'] ?? ColorRange.studio)} (${parentAv1an.encoding?.['color-range'] ?? ColorRange.studio})`,
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['color-range'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['color-range'] = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.['color-range'] === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['color-range'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['color-range'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['color-range'] !== undefined;
            } else if (previousAv1an.encoding['color-range'] !== configurationsStore.defaults.Av1an.encoding?.['color-range']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const chromaPosition = {
        label: 'Chroma Sample Position',
        path: `encoding['chroma-sample-position']`,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding?.['chroma-sample-position'],
                clearable: true,
                options: [
                    { label: `${ChromaSamplePositiontoString(ChromaSamplePosition.Unknown)} (${ChromaSamplePosition.Unknown})`, value: ChromaSamplePosition.Unknown },
                    { label: `${ChromaSamplePositiontoString(ChromaSamplePosition.VerticalLeft)} (${ChromaSamplePosition.VerticalLeft})`, value: ChromaSamplePosition.VerticalLeft },
                    { label: `${ChromaSamplePositiontoString(ChromaSamplePosition.ColocatedTopLeft)} (${ChromaSamplePosition.ColocatedTopLeft})`, value: ChromaSamplePosition.ColocatedTopLeft },
                ],
                onUpdateValue: (value?: number) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1an.encoding?.encoder === Encoder.svt && parentAv1an.encoding['chroma-sample-position'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['chroma-sample-position'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['chroma-sample-position'] = value;
                        }
                    }
                },
                placeholder: `${ChromaSamplePositiontoString(parentAv1an.encoding?.['chroma-sample-position'] ?? ChromaSamplePosition.Unknown)} (${parentAv1an.encoding?.['chroma-sample-position'] ?? ChromaSamplePosition.Unknown})`,
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['chroma-sample-position'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['chroma-sample-position'] = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.['chroma-sample-position'] === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['chroma-sample-position'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['chroma-sample-position'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['chroma-sample-position'] !== undefined;
            } else if (previousAv1an.encoding['chroma-sample-position'] !== configurationsStore.defaults.Av1an.encoding?.['chroma-sample-position']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const masteringDisplay = {
        label: 'Mastering Display',
        path: `encoding['mastering-display']`,
        component:h(
            NInput,
            {
                value: configurationsStore.defaults.Av1an.encoding?.['mastering-display'],
                clearable: true,
                onUpdateValue: (value?: string) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1an.encoding?.encoder === Encoder.svt && parentAv1an.encoding['mastering-display'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['mastering-display'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['mastering-display'] = value;
                        }
                    }
                },
                placeholder: parentAv1an.encoding?.encoder === Encoder.svt ? parentAv1an.encoding?.['mastering-display'] ?? 'G(x,y)B(x,y)R(x,y)WP(x,y)L(max,min)' : 'G(x,y)B(x,y)R(x,y)WP(x,y)L(max,min)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['mastering-display'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }
    
            configurationsStore.defaults.Av1an.encoding['mastering-display'] = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.['mastering-display'] === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['mastering-display'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['mastering-display'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['mastering-display'] !== undefined;
            } else if (previousAv1an.encoding['mastering-display'] !== configurationsStore.defaults.Av1an.encoding?.['mastering-display']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const contentLight = {
        label: 'Content Light Level',
        path: `encoding['content-light']`,
        component:h(
            NInput,
            {
                value: configurationsStore.defaults.Av1an.encoding?.['content-light'],
                clearable: true,
                onUpdateValue: (value?: string) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }
                    if (value !== null) {
                        if (parentAv1an.encoding?.encoder === Encoder.svt && parentAv1an.encoding['content-light'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['content-light'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['content-light'] = value;
                        }
                    }
                },
                placeholder: parentAv1an.encoding?.encoder === Encoder.svt ? parentAv1an.encoding?.['content-light'] ?? 'max_cll,max_fall' : 'max_cll,max_fall',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['content-light'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }
    
            configurationsStore.defaults.Av1an.encoding['content-light'] = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.['content-light'] === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['content-light'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['content-light'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['content-light'] !== undefined;
            } else if (previousAv1an.encoding['content-light'] !== configurationsStore.defaults.Av1an.encoding?.['content-light']) {
                return true;
            } else {
                return false;
            }
        },
    };

    return [
        primaries,
        transfer,
        matrix,
        range,
        chromaPosition,
        masteringDisplay,
        contentLight,
    ];
}
