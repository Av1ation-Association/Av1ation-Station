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

    const keyint = {
        label: 'Keyframe Interval (keyint)',
        path: 'encoding.keyint',
        component: h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1an.encoding?.keyint,
                clearable: true,
                min: -2,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding?.keyint === value) {
                            delete configurationsStore.defaults.Av1an.encoding.keyint;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.keyint = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding?.keyint?.toString() ?? '-2 (Auto: ~5 seconds)' :  '-2 (Auto: ~5 seconds)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.keyint;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding.keyint = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.keyint === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.keyint;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.keyint === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.keyint !== undefined;
            } else if (previousAv1an.encoding.keyint !== configurationsStore.defaults.Av1an.encoding?.keyint) {
                return true;
            } else {
                return false;
            }
        },
    };

    const irefresh = {
        label: 'Intra Refresh Type',
        path: `encoding['irefresh-type']`,
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding ? configurationsStore.defaults.Av1an.encoding['irefresh-type'] : undefined,
                clearable: true,
                options: [
                    { label: 'FWD Frame (Open GOP) (1)', value: 1 },
                    { label: 'KEY Frame (Closed GOP) (2)', value: 2 },
                ],
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding['irefresh-type'] === value) {
                            delete configurationsStore.defaults.Av1an.encoding['irefresh-type'];
                        } else {
                            configurationsStore.defaults.Av1an.encoding['irefresh-type'] = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding['irefresh-type'] === 1 ? 'FWD Frame (Open GOP) (1)' : 'KEY Frame (Closed GOP) (2)' : 'KEY Frame (Closed GOP) (2)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.['irefresh-type'];
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding['irefresh-type'] = null;
        },
        disabled: () => {
            return !!configurationsStore.defaults.Av1an.encoding && JSON.stringify(configurationsStore.defaults.Av1an.encoding['irefresh-type']) === JSON.stringify(null);
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.['irefresh-type'];
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding['irefresh-type'] === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.['irefresh-type'] !== undefined;
            } else if (previousAv1an.encoding['irefresh-type'] !== configurationsStore.defaults.Av1an.encoding?.['irefresh-type']) {
                return true;
            } else {
                return false;
            }
        },
    };

    const scd = {
        label: 'Scene Change Detection',
        path: 'encoding.scd',
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.encoding?.scd,
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
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding?.scd === value) {
                            delete configurationsStore.defaults.Av1an.encoding.scd;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.scd = value;
                        }
                    }
                },
                placeholder: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding?.scd === 1 ? 'Enabled (1)' : 'Disabled (0)' : 'Disabled (0)',
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.encoding?.scd;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.encoding) {
                configurationsStore.defaults.Av1an.encoding = {
                    encoder: Encoder.svt,
                };
            }

            configurationsStore.defaults.Av1an.encoding.scd = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.scd === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.scd;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.scd === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.scd !== undefined;
            } else if (previousAv1an.encoding.scd !== configurationsStore.defaults.Av1an.encoding?.scd) {
                return true;
            } else {
                return false;
            }
        },
    };

    const lookahead = {
        label: 'Lookahead',
        path: 'encoding.lookahead',
        component: h(
            NSlider,
            {
                value: configurationsStore.defaults.Av1an.encoding?.lookahead ?? undefined,
                min: -1,
                max: 120,
                step: 1,
                marks: {
                    '-1': 'Auto (Default)',
                },
                defaultValue: parentAv1an?.encoding?.encoder === Encoder.svt ? parentAv1an?.encoding?.lookahead ?? -1 : -1,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.encoding) {
                        configurationsStore.defaults.Av1an.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        if (parentAv1an?.encoding?.encoder === Encoder.svt && parentAv1an.encoding.lookahead === value) {
                            delete configurationsStore.defaults.Av1an.encoding.lookahead;
                        } else {
                            configurationsStore.defaults.Av1an.encoding.lookahead = value;
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

            configurationsStore.defaults.Av1an.encoding.lookahead = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.encoding?.lookahead === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.encoding?.lookahead;
        },
        isModified: () => {
            if (!previousAv1an.encoding || previousAv1an.encoding.lookahead === undefined) {
                return configurationsStore.defaults.Av1an.encoding?.lookahead !== undefined;
            } else if (previousAv1an.encoding.lookahead !== configurationsStore.defaults.Av1an.encoding?.lookahead) {
                return true;
            } else {
                return false;
            }
        },
    };

    return [
        keyint,
        irefresh,
        scd,
        lookahead,
    ];
}
