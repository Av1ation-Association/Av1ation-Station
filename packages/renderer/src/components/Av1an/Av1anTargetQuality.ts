import { h } from 'vue';
import {
    NInputNumber,
    NSlider,
    NSwitch,
} from 'naive-ui';
import { type ConfigurationType } from '../../../../shared/src/data/Configuration';
import { useConfigurationsStore } from '../../stores/configurations';
import { type FormInputComponent } from './library';

export function getComponents(): FormInputComponent[] {
    const configurationsStore = useConfigurationsStore<ConfigurationType.Task>();
    const parentAv1an = configurationsStore.parentAv1an;
    const previousAv1an = configurationsStore.previousDefaults.Av1an;

    const targetVMAFScore = {
        label: 'Target VMAF Score',
        path: 'targetQuality.targetVMAFScore',
        component: h(
            NSlider,
            {
                value: configurationsStore.defaults.Av1an.targetQuality?.targetVMAFScore ?? undefined,
                min: 0,
                max: 100,
                step: 1,
                defaultValue: parentAv1an.targetQuality?.targetVMAFScore ?? undefined,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.targetQuality) {
                        configurationsStore.defaults.Av1an.targetQuality = {
                            targetVMAFScore: value,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an.targetQuality?.targetVMAFScore === value) {
                            delete configurationsStore.defaults.Av1an.targetQuality.targetVMAFScore;
                        } else {
                            configurationsStore.defaults.Av1an.targetQuality.targetVMAFScore = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.targetQuality?.targetVMAFScore;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.targetQuality) {
                configurationsStore.defaults.Av1an.targetQuality = {};
            }

            configurationsStore.defaults.Av1an.targetQuality.targetVMAFScore = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.targetQuality?.targetVMAFScore === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.targetQuality?.targetVMAFScore;
        },
        isModified: () => {
            if (!previousAv1an.targetQuality || previousAv1an.targetQuality.targetVMAFScore === undefined) {
                return configurationsStore.defaults.Av1an.targetQuality?.targetVMAFScore !== undefined;
            } else if (previousAv1an.targetQuality.targetVMAFScore !== configurationsStore.defaults.Av1an.targetQuality?.targetVMAFScore) {
                return true;
            } else {
                return false;
            }
        },
    };

    const maximumProbes = {
        label: 'Max Probes',
        path: 'targetQuality.maximumProbes',
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

    const probeSlow = {
        label: 'Probe Slow',
        path: 'targetQuality.probeSlow',
        component: h(
            NSwitch,
            {
                value: configurationsStore.defaults.Av1an.targetQuality?.probeSlow ?? undefined,
                clearable: true,
                defaultValue: parentAv1an.targetQuality?.probeSlow ?? undefined,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.targetQuality) {
                        configurationsStore.defaults.Av1an.targetQuality = {};
                    }

                    if (value !== null) {
                        if (parentAv1an.targetQuality?.probeSlow === value) {
                            delete configurationsStore.defaults.Av1an.targetQuality?.probeSlow;
                        } else {
                            configurationsStore.defaults.Av1an.targetQuality.probeSlow = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.targetQuality?.probeSlow;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.targetQuality) {
                configurationsStore.defaults.Av1an.targetQuality = {};
            }

            configurationsStore.defaults.Av1an.targetQuality.probeSlow = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.targetQuality?.probeSlow === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.targetQuality?.probeSlow;
        },
        isModified: () => {
            if (!previousAv1an.targetQuality || previousAv1an.targetQuality.probeSlow === undefined) {
                return configurationsStore.defaults.Av1an.targetQuality?.probeSlow !== undefined;
            } else if (previousAv1an.targetQuality.probeSlow !== configurationsStore.defaults.Av1an.targetQuality?.probeSlow) {
                return true;
            } else {
                return false;
            }
        },
    };

    const minimumQ = {
        label: 'Minimum Q',
        path: 'targetQuality.minimumQ',
        component: h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1an.targetQuality?.minimumQ,
                min: 0,
                clearable: true,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.targetQuality) {
                        configurationsStore.defaults.Av1an.targetQuality = {};
                    }

                    if (value !== null) {
                        if (parentAv1an.targetQuality?.minimumQ === value) {
                            delete configurationsStore.defaults.Av1an.targetQuality?.minimumQ;
                        } else {
                            configurationsStore.defaults.Av1an.targetQuality.minimumQ = value;
                        }
                    }
                },
                placeholder: parentAv1an.targetQuality?.minimumQ?.toString() ?? '',
                // defaultValue: parentAv1an.targetQuality?.minimumQ,
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.targetQuality?.minimumQ;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.targetQuality) {
                configurationsStore.defaults.Av1an.targetQuality = {};
            }

            configurationsStore.defaults.Av1an.targetQuality.minimumQ = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.targetQuality?.minimumQ === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.targetQuality?.minimumQ;
        },
        isModified: () => {
            if (!previousAv1an.targetQuality || previousAv1an.targetQuality.minimumQ === undefined) {
                return configurationsStore.defaults.Av1an.targetQuality?.minimumQ !== undefined;
            } else if (previousAv1an.targetQuality.minimumQ !== configurationsStore.defaults.Av1an.targetQuality?.minimumQ) {
                return true;
            } else {
                return false;
            }
        },
    };

    const maximumQ = {
        label: 'Maximum Q',
        path: 'targetQuality.maximumQ',
        component: h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1an.targetQuality?.maximumQ,
                min: 0,
                clearable: true,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.targetQuality) {
                        configurationsStore.defaults.Av1an.targetQuality = {};
                    }

                    if (value !== null) {
                        if (parentAv1an.targetQuality?.maximumQ === value) {
                            delete configurationsStore.defaults.Av1an.targetQuality?.maximumQ;
                        } else {
                            configurationsStore.defaults.Av1an.targetQuality.maximumQ = value;
                        }
                    }
                },
                placeholder: parentAv1an.targetQuality?.maximumQ?.toString() ?? '',
                // defaultValue: parentAv1an.targetQuality?.maximumQ,
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.targetQuality?.maximumQ;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.targetQuality) {
                configurationsStore.defaults.Av1an.targetQuality = {};
            }

            configurationsStore.defaults.Av1an.targetQuality.maximumQ = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.targetQuality?.maximumQ === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.targetQuality?.maximumQ;
        },
        isModified: () => {
            if (!previousAv1an.targetQuality || previousAv1an.targetQuality.maximumQ === undefined) {
                return configurationsStore.defaults.Av1an.targetQuality?.maximumQ !== undefined;
            } else if (previousAv1an.targetQuality.maximumQ !== configurationsStore.defaults.Av1an.targetQuality?.maximumQ) {
                return true;
            } else {
                return false;
            }
        },
    };

    return [
        targetVMAFScore,
        maximumProbes,
        probeSlow,
        minimumQ,
        maximumQ,
    ];
}
