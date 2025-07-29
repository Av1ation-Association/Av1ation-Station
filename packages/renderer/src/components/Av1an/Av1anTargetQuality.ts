import { h } from 'vue';
import {
    NInput,
    NInputNumber,
    NSelect,
    NSlider,
    NSwitch,
} from 'naive-ui';
import { type ConfigurationType } from '../../../../shared/src/data/Configuration';
import { useConfigurationsStore } from '../../stores/configurations';
import { type FormInputComponent } from './library';
import { Encoder, InterpolationMethod, InterpolationMethodtoString, ProbeStatistic, ProbeStatistictoString, TargetMetric, TargetMetrictoString, VMAFFeature, VMAFFeaturetoString } from '../../../../shared/src/data/Types/Options';

export function getComponents(): FormInputComponent[] {
    const configurationsStore = useConfigurationsStore<ConfigurationType.Task>();
    const parentAv1an = configurationsStore.parentAv1an;
    const previousAv1an = configurationsStore.previousDefaults.Av1an;

   

    const targetMetric = {
        label: 'Target Metric',
        path: 'targetQuality.metric',
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.targetQuality?.metric,
                clearable: true,
                options: [
                    { label: 'VMAF', value: TargetMetric.VMAF },
                    { label: 'SSIMULACRA2', value: TargetMetric.SSIMULACRA2 },
                    { label: 'butteraugli INF-Norm', value: TargetMetric.butteraugliinf },
                    { label: 'butteraugli 3-Norm', value: TargetMetric.butteraugli3 },
                    { label: 'XPSNR', value: TargetMetric.XPSNR },
                    { label: 'Weighted XPSNR', value: TargetMetric.XPSNRWeighted },
                ],
                placeholder: TargetMetrictoString(parentAv1an.targetQuality?.metric ?? TargetMetric.VMAF),
                onUpdateValue: (value?: TargetMetric) => {
                    if (!configurationsStore.defaults.Av1an.targetQuality) {
                        configurationsStore.defaults.Av1an.targetQuality = {};
                    }
                    if (value !== null) {
                        if (parentAv1an.targetQuality?.metric === value) {
                            delete configurationsStore.defaults.Av1an.targetQuality.metric;
                        } else {
                            configurationsStore.defaults.Av1an.targetQuality.metric = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.targetQuality?.metric;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.targetQuality) {
                configurationsStore.defaults.Av1an.targetQuality = {};
            }

            configurationsStore.defaults.Av1an.targetQuality.metric = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.targetQuality?.metric === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.targetQuality?.metric;
        },
        isModified: () => {
            if (!previousAv1an.targetQuality || previousAv1an.targetQuality.metric === undefined) {
                return configurationsStore.defaults.Av1an.targetQuality?.metric !== undefined;
            } else if (previousAv1an.targetQuality.metric !== configurationsStore.defaults.Av1an.targetQuality?.metric) {
                return true;
            } else {
                return false;
            }
        },
    };

    const chosenMetric = configurationsStore.defaults.Av1an.targetQuality?.metric ?? parentAv1an.targetQuality?.metric ?? TargetMetric.VMAF;
    const targetScoreRange = {
        label: 'Target Score Range',
        path: 'targetQuality.target',
        component: h(
            NSlider,
            {
                value: configurationsStore.defaults.Av1an.targetQuality?.target ? [configurationsStore.defaults.Av1an.targetQuality.target.minimum, configurationsStore.defaults.Av1an.targetQuality.target.maximum] : [89, 91],
                min: 0,
                max: chosenMetric === TargetMetric.butteraugliinf || chosenMetric === TargetMetric.butteraugli3 ? 10 : 100,
                step: chosenMetric === TargetMetric.butteraugliinf || chosenMetric === TargetMetric.butteraugli3 ? 0.01 : chosenMetric === TargetMetric.XPSNR || chosenMetric === TargetMetric.XPSNRWeighted ? 0.5 : 1,
                range: true,
                marks: {
                    0: chosenMetric === TargetMetric.butteraugliinf || chosenMetric === TargetMetric.butteraugli3 ? 'Best' : 'Worst',
                },
                reverse: chosenMetric === TargetMetric.butteraugliinf || chosenMetric === TargetMetric.butteraugli3,
                defaultValue: parentAv1an.targetQuality?.target ? [parentAv1an.targetQuality.target.minimum, parentAv1an.targetQuality.target.maximum] : undefined,
                onUpdateValue: ([value1, value2]) => {
                    const minimum = value1 <= value2 ? value1 : value2;
                    const maximum = value1 >= value2 ? value1 : value2;
                    if (!configurationsStore.defaults.Av1an.targetQuality) {
                        configurationsStore.defaults.Av1an.targetQuality = {};
                    }
    
                    if (parentAv1an.targetQuality?.target?.minimum === minimum && parentAv1an.targetQuality.target.maximum === maximum) {
                        delete configurationsStore.defaults.Av1an.targetQuality.target;
                    } else {
                        configurationsStore.defaults.Av1an.targetQuality.target = {
                            minimum,
                            maximum,
                        };
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.targetQuality?.target;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.targetQuality) {
                configurationsStore.defaults.Av1an.targetQuality = {};
            }

            configurationsStore.defaults.Av1an.targetQuality.target = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.targetQuality?.target === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.targetQuality?.target;
        },
        isModified: () => {
            if (!previousAv1an.targetQuality || previousAv1an.targetQuality.target === undefined) {
                return configurationsStore.defaults.Av1an.targetQuality?.target !== undefined;
            } else if (previousAv1an.targetQuality.target?.minimum !== configurationsStore.defaults.Av1an.targetQuality?.target?.minimum || previousAv1an.targetQuality.target?.maximum !== configurationsStore.defaults.Av1an.targetQuality?.target?.maximum) {
                return true;
            } else {
                return false;
            }
        },
    };

    const maximumProbes = {
        label: 'Max Probes',
        path: 'targetQuality.maximumProbes',
        advanced: true,
        component: h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1an.targetQuality?.maximumProbes,
                min: 1,
                clearable: true,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.targetQuality) {
                        configurationsStore.defaults.Av1an.targetQuality = {};
                    }

                    if (value !== null) {
                        if (parentAv1an.targetQuality?.maximumProbes === value) {
                            delete configurationsStore.defaults.Av1an.targetQuality?.maximumProbes;
                        } else {
                            configurationsStore.defaults.Av1an.targetQuality.maximumProbes = value;
                        }
                    }
                },
                placeholder: parentAv1an.targetQuality?.maximumProbes?.toString() ?? '4',
                // defaultValue: parentAv1an.targetQuality?.maximumProbes,
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.targetQuality?.maximumProbes;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.targetQuality) {
                configurationsStore.defaults.Av1an.targetQuality = {};
            }

            configurationsStore.defaults.Av1an.targetQuality.maximumProbes = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.targetQuality?.maximumProbes === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.targetQuality?.maximumProbes;
        },
        isModified: () => {
            if (!previousAv1an.targetQuality || previousAv1an.targetQuality.maximumProbes === undefined) {
                return configurationsStore.defaults.Av1an.targetQuality?.maximumProbes !== undefined;
            } else if (previousAv1an.targetQuality.maximumProbes !== configurationsStore.defaults.Av1an.targetQuality?.maximumProbes) {
                return true;
            } else {
                return false;
            }
        },
    };

    const probeRate = {
        label: 'Probe Rate',
        path: 'targetQuality.probingFrameRate',
        component: h(
            NSlider,
            {
                value: configurationsStore.defaults.Av1an.targetQuality?.probingFrameRate ?? undefined,
                min: 1,
                max: 4,
                step: 1,
                defaultValue: parentAv1an.targetQuality?.probingFrameRate ?? undefined,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.targetQuality) {
                        configurationsStore.defaults.Av1an.targetQuality = {};
                    }

                    if (parentAv1an.targetQuality?.probingFrameRate === value) {
                        delete configurationsStore.defaults.Av1an.targetQuality.probingFrameRate;
                    } else {
                        configurationsStore.defaults.Av1an.targetQuality.probingFrameRate = value;
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.targetQuality?.probingFrameRate;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.targetQuality) {
                configurationsStore.defaults.Av1an.targetQuality = {};
            }

            configurationsStore.defaults.Av1an.targetQuality.probingFrameRate = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.targetQuality?.probingFrameRate === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.targetQuality?.probingFrameRate;
        },
        isModified: () => {
            if (!previousAv1an.targetQuality || previousAv1an.targetQuality.probingFrameRate === undefined) {
                return configurationsStore.defaults.Av1an.targetQuality?.probingFrameRate !== undefined;
            } else if (previousAv1an.targetQuality.probingFrameRate !== configurationsStore.defaults.Av1an.targetQuality?.probingFrameRate) {
                return true;
            } else {
                return false;
            }
        },
    };

    const copyVideoParameters = {
        label: 'Probe Copy Video Parameters',
        path: 'targetQuality.probeVideoParameters',
        advanced: true,
        component: h(
            NSwitch,
            {
                value: configurationsStore.defaults.Av1an.targetQuality?.probeVideoParameters?.copy ?? undefined,
                clearable: true,
                defaultValue: parentAv1an.targetQuality?.probeVideoParameters?.copy ?? undefined,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.targetQuality) {
                        configurationsStore.defaults.Av1an.targetQuality = {};
                    }
                    
                    if (value !== null) {
                        if (parentAv1an.targetQuality?.probeVideoParameters?.copy === value) {
                            delete configurationsStore.defaults.Av1an.targetQuality.probeVideoParameters;
                        } else {
                            if (!configurationsStore.defaults.Av1an.targetQuality.probeVideoParameters) {
                                configurationsStore.defaults.Av1an.targetQuality.probeVideoParameters = {
                                    copy: value,
                                    parameters: {},
                                };
                            }
                            configurationsStore.defaults.Av1an.targetQuality.probeVideoParameters.copy = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.targetQuality?.probeVideoParameters;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.targetQuality) {
                configurationsStore.defaults.Av1an.targetQuality = {};
            }

            configurationsStore.defaults.Av1an.targetQuality.probeVideoParameters = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.targetQuality?.probeVideoParameters === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.targetQuality?.probeVideoParameters;
        },
        isModified: () => {
            if (!previousAv1an.targetQuality || previousAv1an.targetQuality.probeVideoParameters === undefined) {
                return configurationsStore.defaults.Av1an.targetQuality?.probeVideoParameters !== undefined;
            } else if (previousAv1an.targetQuality.probeVideoParameters?.copy !== configurationsStore.defaults.Av1an.targetQuality?.probeVideoParameters?.copy) {
                return true;
            } else {
                return false;
            }
        },
    };

    const chosenEncoder = configurationsStore.defaults.Av1an.encoding?.encoder ?? parentAv1an.encoding?.encoder ?? Encoder.aom;
    const [defaultMinimumQuantizer, defaultMaximumQuantizer] = chosenEncoder === Encoder.aom || chosenEncoder === Encoder.vpx ? [15, 55] : chosenEncoder === Encoder.rav1e ? [50, 140] : chosenEncoder === Encoder.svt ? [15, 50] : chosenEncoder === Encoder.x264 || chosenEncoder === Encoder.x265 ? [15, 35] : [15, 35];
    const quantizerRange = {
        label: 'Quantizer Range',
        path: 'targetQuality.quantizerRange',
        advanced: true,
        component: h(
            NSlider,
            {
                value: configurationsStore.defaults.Av1an.targetQuality?.quantizerRange ? [configurationsStore.defaults.Av1an.targetQuality.quantizerRange.minimum, configurationsStore.defaults.Av1an.targetQuality.quantizerRange.maximum] : [defaultMinimumQuantizer, defaultMaximumQuantizer],
                min: chosenEncoder === Encoder.x264 ? -12 : 0,
                max: chosenEncoder === Encoder.rav1e ? 255 : chosenEncoder === Encoder.x264 || chosenEncoder === Encoder.x265 ? 51 : 63,
                step: 1,
                range: true,
                defaultValue: parentAv1an.targetQuality?.quantizerRange ? [parentAv1an.targetQuality.quantizerRange.minimum, parentAv1an.targetQuality.quantizerRange.maximum] : undefined,
                onUpdateValue: ([value1, value2]) => {
                    const minimum = value1 <= value2 ? value1 : value2;
                    const maximum = value1 >= value2 ? value1 : value2;
                    if (!configurationsStore.defaults.Av1an.targetQuality) {
                        configurationsStore.defaults.Av1an.targetQuality = {};
                    }

                    if (parentAv1an.targetQuality?.quantizerRange?.minimum === minimum && parentAv1an.targetQuality.quantizerRange.maximum === maximum) {
                        delete configurationsStore.defaults.Av1an.targetQuality.quantizerRange;
                    } else {
                        configurationsStore.defaults.Av1an.targetQuality.quantizerRange = {
                            minimum,
                            maximum,
                        };
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.targetQuality?.quantizerRange;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.targetQuality) {
                configurationsStore.defaults.Av1an.targetQuality = {};
            }

            configurationsStore.defaults.Av1an.targetQuality.quantizerRange = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.targetQuality?.quantizerRange === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.targetQuality?.quantizerRange;
        },
        isModified: () => {
            if (!previousAv1an.targetQuality || previousAv1an.targetQuality.quantizerRange === undefined) {
                return configurationsStore.defaults.Av1an.targetQuality?.quantizerRange !== undefined;
            } else if (previousAv1an.targetQuality.quantizerRange?.minimum !== configurationsStore.defaults.Av1an.targetQuality?.quantizerRange?.minimum || previousAv1an.targetQuality.quantizerRange?.maximum !== configurationsStore.defaults.Av1an.targetQuality?.quantizerRange?.maximum) {
                return true;
            } else {
                return false;
            }
        },
    };

    const probeResolution = {
        label: 'Probe Resolution',
        path: 'targetQuality.probeResolution',
        advanced: true,
        component: h(
            NInput,
            {
                value: configurationsStore.defaults.Av1an.targetQuality?.probeResolution,
                clearable: true,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.targetQuality) {
                        configurationsStore.defaults.Av1an.targetQuality = {};
                    }

                    if (value !== null) {
                        if (parentAv1an.targetQuality?.probeResolution === value) {
                            delete configurationsStore.defaults.Av1an.targetQuality.probeResolution;
                        } else {
                            configurationsStore.defaults.Av1an.targetQuality.probeResolution = value;
                        }
                    }
                },
                placeholder: parentAv1an.targetQuality?.probeResolution ?? 'WidthxHeight',
                // defaultValue: parentAv1an.targetQuality?.probeResolution,
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.targetQuality?.probeResolution;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.targetQuality) {
                configurationsStore.defaults.Av1an.targetQuality = {};
            }

            configurationsStore.defaults.Av1an.targetQuality.probeResolution = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.targetQuality?.probeResolution === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.targetQuality?.probeResolution;
        },
        isModified: () => {
            if (!previousAv1an.targetQuality || previousAv1an.targetQuality.probeResolution === undefined) {
                return configurationsStore.defaults.Av1an.targetQuality?.probeResolution !== undefined;
            } else if (previousAv1an.targetQuality.probeResolution !== configurationsStore.defaults.Av1an.targetQuality?.probeResolution) {
                return true;
            } else {
                return false;
            }
        },
    };

    const probeStatistic = {
        label: 'Probe Statistic',
        path: 'targetQuality.probeStatistic.name',
        advanced: true,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.targetQuality?.probeStatistic?.name,
                clearable: true,
                options: [
                    { label: 'Automatic', value: ProbeStatistic.Automatic },
                    { label: 'Mean', value: ProbeStatistic.Mean },
                    { label: 'Harmonic Mean', value: ProbeStatistic.HarmonicMean },
                    { label: 'Median', value: ProbeStatistic.Median },
                    { label: 'Mode', value: ProbeStatistic.Mode },
                    { label: 'Minimum', value: ProbeStatistic.Minimum },
                    { label: 'Maximum', value: ProbeStatistic.Maximum },
                    { label: 'Percentile', value: ProbeStatistic.Percentile },
                    { label: 'Standard Deviations Distance (σ)', value: ProbeStatistic.StandardDeviationsDistance },
                    { label: 'Root Mean Square (Quadratic Mean)', value: ProbeStatistic.RootMeanSquare },
                ],
                placeholder: ProbeStatistictoString(parentAv1an.targetQuality?.probeStatistic?.name ?? ProbeStatistic.Automatic),
                onUpdateValue: (value?: ProbeStatistic) => {
                    if (!configurationsStore.defaults.Av1an.targetQuality) {
                        configurationsStore.defaults.Av1an.targetQuality = {};
                    }
                    if (value !== null && value !== undefined) {
                        if (!configurationsStore.defaults.Av1an.targetQuality.probeStatistic) {
                            configurationsStore.defaults.Av1an.targetQuality.probeStatistic = {
                                name: value,
                                value: parentAv1an.targetQuality?.probeStatistic?.value ?? value === ProbeStatistic.Percentile ? 1 : value === ProbeStatistic.StandardDeviationsDistance ? -1 : undefined,
                            };
                        }
                        if (parentAv1an.targetQuality?.probeStatistic?.name === value && parentAv1an.targetQuality.probeStatistic.value === configurationsStore.defaults.Av1an.targetQuality.probeStatistic.value) {
                            delete configurationsStore.defaults.Av1an.targetQuality.probeStatistic;
                        } else {
                            configurationsStore.defaults.Av1an.targetQuality.probeStatistic.name = value;
                            // Remove value
                            switch (value) {
                                case ProbeStatistic.Percentile:
                                case ProbeStatistic.StandardDeviationsDistance:
                                    break;
                                default:
                                    delete configurationsStore.defaults.Av1an.targetQuality.probeStatistic.value;
                                    break;
                            }
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.targetQuality?.probeStatistic;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.targetQuality) {
                configurationsStore.defaults.Av1an.targetQuality = {};
            }

            configurationsStore.defaults.Av1an.targetQuality.probeStatistic = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.targetQuality?.probeStatistic === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.targetQuality?.probeStatistic;
        },
        isModified: () => {
            if (!previousAv1an.targetQuality || !previousAv1an.targetQuality.probeStatistic) {
                return configurationsStore.defaults.Av1an.targetQuality?.probeStatistic !== undefined;
            } else if (previousAv1an.targetQuality.probeStatistic.name !== configurationsStore.defaults.Av1an.targetQuality?.probeStatistic?.name && previousAv1an.targetQuality.probeStatistic.value !== configurationsStore.defaults.Av1an.targetQuality?.probeStatistic?.value) {
                return true;
            } else {
                return false;
            }
        },
    };

    const chosenStatistic = configurationsStore.defaults.Av1an.targetQuality?.probeStatistic?.name ?? parentAv1an.targetQuality?.probeStatistic?.name ?? ProbeStatistic.Automatic;
    let probeStatisticValue: FormInputComponent | undefined = undefined;
    if (chosenStatistic === ProbeStatistic.Percentile || chosenStatistic === ProbeStatistic.StandardDeviationsDistance) {
        probeStatisticValue = {
            label: 'Probe Statistic Value',
            path: 'targetQuality.probeStatistic.value',
            advanced: true,
            component: h(
                NInputNumber,
                {
                    value: configurationsStore.defaults.Av1an.targetQuality?.probeStatistic?.value,
                    precision: 2,
                    clearable: true,
                    onUpdateValue: (value) => {
                        if (!configurationsStore.defaults.Av1an.targetQuality) {
                            configurationsStore.defaults.Av1an.targetQuality = {};
                        }

                        if (value !== null) {
                            if (!configurationsStore.defaults.Av1an.targetQuality.probeStatistic) {
                                configurationsStore.defaults.Av1an.targetQuality.probeStatistic = {
                                    name: parentAv1an.targetQuality?.probeStatistic?.name ?? chosenStatistic ?? ProbeStatistic.Percentile,
                                    value,
                                };
                            }
                            if (parentAv1an.targetQuality?.probeStatistic?.value === value && parentAv1an.targetQuality.probeStatistic.name === configurationsStore.defaults.Av1an.targetQuality.probeStatistic?.name) {
                                delete configurationsStore.defaults.Av1an.targetQuality?.probeStatistic;
                            } else {
                                configurationsStore.defaults.Av1an.targetQuality.probeStatistic.value = value;
                            }
                        }
                    },
                    placeholder: parentAv1an.targetQuality?.probeStatistic?.value?.toString(),
                    // defaultValue: parentAv1an.targetQuality?.maximumProbes,
                    onClear: () => {
                        delete configurationsStore.defaults.Av1an.targetQuality?.probeStatistic;
                    },
                },
            ),
            disable: () => {
                if (!configurationsStore.defaults.Av1an.targetQuality) {
                    configurationsStore.defaults.Av1an.targetQuality = {};
                }

                configurationsStore.defaults.Av1an.targetQuality.probeStatistic = null;
            },
            disabled: () => {
                return configurationsStore.defaults.Av1an.targetQuality?.probeStatistic === null;
            },
            reset: () => {
                delete configurationsStore.defaults.Av1an.targetQuality?.probeStatistic;
            },
            isModified: () => {
                if (!previousAv1an.targetQuality || !previousAv1an.targetQuality.probeStatistic) {
                    return configurationsStore.defaults.Av1an.targetQuality?.probeStatistic !== undefined;
                } else if (previousAv1an.targetQuality.probeStatistic.value !== configurationsStore.defaults.Av1an.targetQuality?.probeStatistic?.value && previousAv1an.targetQuality.probeStatistic.name !== configurationsStore.defaults.Av1an.targetQuality?.probeStatistic?.name) {
                    return true;
                } else {
                    return false;
                }
            },
        };
    }

    const probeInterpolationMethod4 = {
        label: '4th Probe Interpolation Method',
        path: 'targetQuality.interpolationMethod',
        advanced: true,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.targetQuality?.interpolationMethod?.pass4,
                clearable: true,
                options: [
                    { label: 'Linear', value: InterpolationMethod.Linear },
                    { label: 'Quadratic', value: InterpolationMethod.Quadratic },
                    { label: 'Natural Cubic Spline', value: InterpolationMethod.NaturalCubicSpline },
                ],
                placeholder: InterpolationMethodtoString(parentAv1an.targetQuality?.interpolationMethod?.pass4 ?? InterpolationMethod.NaturalCubicSpline),
                onUpdateValue: (value?: InterpolationMethod.Linear | InterpolationMethod.Quadratic | InterpolationMethod.NaturalCubicSpline) => {
                    if (!configurationsStore.defaults.Av1an.targetQuality) {
                        configurationsStore.defaults.Av1an.targetQuality = {};
                    }
                    if (value !== null && value !== undefined) {
                        if (!configurationsStore.defaults.Av1an.targetQuality.interpolationMethod) {
                            configurationsStore.defaults.Av1an.targetQuality.interpolationMethod = {
                                pass4: value,
                                pass5: parentAv1an.targetQuality?.interpolationMethod?.pass5 ?? InterpolationMethod.PiecewiseCubicHermite,
                            };
                        }
                        if (parentAv1an.targetQuality?.interpolationMethod?.pass4 === value && parentAv1an.targetQuality.interpolationMethod.pass5 === configurationsStore.defaults.Av1an.targetQuality.interpolationMethod.pass5) {
                            delete configurationsStore.defaults.Av1an.targetQuality.interpolationMethod;
                        } else {
                            configurationsStore.defaults.Av1an.targetQuality.interpolationMethod.pass4 = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.targetQuality?.interpolationMethod;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.targetQuality) {
                configurationsStore.defaults.Av1an.targetQuality = {};
            }

            configurationsStore.defaults.Av1an.targetQuality.interpolationMethod = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.targetQuality?.interpolationMethod === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.targetQuality?.interpolationMethod;
        },
        isModified: () => {
            if (!previousAv1an.targetQuality || !previousAv1an.targetQuality.interpolationMethod) {
                return configurationsStore.defaults.Av1an.targetQuality?.interpolationMethod !== undefined;
            } else if (previousAv1an.targetQuality.interpolationMethod.pass4 !== configurationsStore.defaults.Av1an.targetQuality?.interpolationMethod?.pass4 && previousAv1an.targetQuality.interpolationMethod.pass5 !== configurationsStore.defaults.Av1an.targetQuality?.interpolationMethod?.pass5) {
                return true;
            } else {
                return false;
            }
        },
    };

    const probeInterpolationMethod5 = {
        label: '5th Probe Interpolation Method',
        path: 'targetQuality.interpolationMethod',
        advanced: true,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.targetQuality?.interpolationMethod?.pass5,
                clearable: true,
                options: [
                    { label: 'Linear', value: InterpolationMethod.Linear },
                    { label: 'Quadratic', value: InterpolationMethod.Quadratic },
                    { label: 'Natural Cubic Spline', value: InterpolationMethod.NaturalCubicSpline },
                    { label: 'Piecewise Cubic Hermite', value: InterpolationMethod.PiecewiseCubicHermite },
                    { label: 'Catmull-Rom Spline', value: InterpolationMethod.CatmullRomSpline },
                    { label: 'Akima Spline', value: InterpolationMethod.AkimaSpline },
                    { label: 'Cubic Polynomial', value: InterpolationMethod.CubicPolynomial },
                ],
                placeholder: InterpolationMethodtoString(parentAv1an.targetQuality?.interpolationMethod?.pass5 ?? InterpolationMethod.PiecewiseCubicHermite),
                onUpdateValue: (value?: InterpolationMethod) => {
                    if (!configurationsStore.defaults.Av1an.targetQuality) {
                        configurationsStore.defaults.Av1an.targetQuality = {};
                    }
                    if (value !== null && value !== undefined) {
                        if (!configurationsStore.defaults.Av1an.targetQuality.interpolationMethod) {
                            configurationsStore.defaults.Av1an.targetQuality.interpolationMethod = {
                                pass4: parentAv1an.targetQuality?.interpolationMethod?.pass4 ?? InterpolationMethod.NaturalCubicSpline,
                                pass5: value,
                            };
                        }
                        if (parentAv1an.targetQuality?.interpolationMethod?.pass5 === value && parentAv1an.targetQuality.interpolationMethod.pass4 === configurationsStore.defaults.Av1an.targetQuality.interpolationMethod.pass4) {
                            delete configurationsStore.defaults.Av1an.targetQuality.interpolationMethod;
                        } else {
                            configurationsStore.defaults.Av1an.targetQuality.interpolationMethod.pass5 = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.targetQuality?.interpolationMethod;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.targetQuality) {
                configurationsStore.defaults.Av1an.targetQuality = {};
            }

            configurationsStore.defaults.Av1an.targetQuality.interpolationMethod = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.targetQuality?.interpolationMethod === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.targetQuality?.interpolationMethod;
        },
        isModified: () => {
            if (!previousAv1an.targetQuality || !previousAv1an.targetQuality.interpolationMethod) {
                return configurationsStore.defaults.Av1an.targetQuality?.interpolationMethod !== undefined;
            } else if (previousAv1an.targetQuality.interpolationMethod.pass5 !== configurationsStore.defaults.Av1an.targetQuality?.interpolationMethod?.pass5 && previousAv1an.targetQuality.interpolationMethod.pass4 !== configurationsStore.defaults.Av1an.targetQuality?.interpolationMethod?.pass4) {
                return true;
            } else {
                return false;
            }
        },
    };

    function vmafSetsEquivalent(a: Set<VMAFFeature>, b: Set<VMAFFeature>) {
        if (a.size !== b.size) {
            return false;
        }

        return Array.from(a).every(item => b.has(item));
    }

    const vmafFeatures = {
        label: 'VMAF Features',
        path: 'targetQuality.VMAFFeatures',
        advanced: true,
        component: h(
            NSelect,
            {
                value: Array.from(configurationsStore.defaults.Av1an.targetQuality?.VMAFFeatures ?? []),
                clearable: true,
                multiple: true,
                options: [
                    { label: 'Default', value: VMAFFeature.Default },
                    { label: 'Motionless', value: VMAFFeature.Motionless },
                    { label: 'NEG', value: VMAFFeature.Neg },
                    { label: 'Ultra High Definition', value: VMAFFeature.UHD },
                    { label: 'Weighted', value: VMAFFeature.Weighted },
                ],
                placeholder: Array.from(parentAv1an.targetQuality?.VMAFFeatures ?? [VMAFFeature.Default]).map(feature => VMAFFeaturetoString(feature)).join(', '),
                onUpdateValue: (value?: VMAFFeature[]) => {
                    if (!configurationsStore.defaults.Av1an.targetQuality) {
                        configurationsStore.defaults.Av1an.targetQuality = {};
                    }
                    if (value !== null) {
                        const VMAFSet = new Set<VMAFFeature>(value);
                        if (!configurationsStore.defaults.Av1an.targetQuality.VMAFFeatures) {
                            configurationsStore.defaults.Av1an.targetQuality.VMAFFeatures = VMAFSet;
                        }
                        if (vmafSetsEquivalent(parentAv1an.targetQuality?.VMAFFeatures ?? (new Set([VMAFFeature.Default])), VMAFSet)) {
                            delete configurationsStore.defaults.Av1an.targetQuality.VMAFFeatures;
                        } else {
                            configurationsStore.defaults.Av1an.targetQuality.VMAFFeatures = VMAFSet;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.targetQuality?.VMAFFeatures;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.targetQuality) {
                configurationsStore.defaults.Av1an.targetQuality = {};
            }

            configurationsStore.defaults.Av1an.targetQuality.VMAFFeatures = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.targetQuality?.VMAFFeatures === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.targetQuality?.VMAFFeatures;
        },
        isModified: () => {
            if (!previousAv1an.targetQuality || !previousAv1an.targetQuality.VMAFFeatures) {
                return configurationsStore.defaults.Av1an.targetQuality?.VMAFFeatures !== undefined;
            } else {
                return !vmafSetsEquivalent(previousAv1an.targetQuality.VMAFFeatures, configurationsStore.defaults.Av1an.targetQuality?.VMAFFeatures ?? new Set<VMAFFeature>());
            }
        },
    };

    return [
        targetMetric,
        targetScoreRange,
        maximumProbes,
        probeRate,
        copyVideoParameters,
        quantizerRange,
        probeResolution,
        probeStatistic,
        ...(probeStatisticValue ? [probeStatisticValue] : []),
        probeInterpolationMethod4,
        probeInterpolationMethod5,
        vmafFeatures,
    ];
}
