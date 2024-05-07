import {
    type Ref,
    h,
} from 'vue';
import {
    NInputNumber,
    NSlider,
    NSwitch,
} from 'naive-ui';
import {
    type PartialChildren,
    type PartialAv1anConfiguration,
} from '../Configuration/ConfigurationDefaults.vue';
import { type FormInputComponent } from './library';
import { type Task } from '../../../../main/src/data/Configuration/Projects';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration | PartialChildren<Task['item']['Av1an']>>, parentAv1anValue?: PartialAv1anConfiguration): FormInputComponent[] {
    const targetVMAFScore = {
        label: 'Target VMAF Score',
        path: 'targetQuality.targetVMAFScore',
        component: h(
            NSlider,
            {
                value: formValueRef.value.targetQuality?.targetVMAFScore ?? undefined,
                min: 0,
                max: 100,
                step: 1,
                defaultValue: parentAv1anValue?.targetQuality?.targetVMAFScore ?? undefined,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.targetQuality) {
                        formValueRef.value.targetQuality = {};
                    }
                    
                    if (value !== null) {
                        if (parentAv1anValue?.targetQuality?.targetVMAFScore === value) {
                            delete formValueRef.value.targetQuality?.targetVMAFScore;
                        } else {
                            formValueRef.value.targetQuality.targetVMAFScore = value;
                        }
                    }
                },
                onClear: () => {
                    delete formValueRef.value.targetQuality?.targetVMAFScore;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.targetQuality) {
                formValueRef.value.targetQuality = {};
            }

            formValueRef.value.targetQuality.targetVMAFScore = null;
        },
        disabled: () => {
            return formValueRef.value.targetQuality?.targetVMAFScore === null;
        },
        reset: () => {
            delete formValueRef.value.targetQuality?.targetVMAFScore;
        },
    };

    const maximumProbes = {
        label: 'Max Probes',
        path: 'targetQuality.maximumProbes',
        component: h(
            NInputNumber,
            {
                value: formValueRef.value.targetQuality?.maximumProbes,
                min: 1,
                clearable: true,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.targetQuality) {
                        formValueRef.value.targetQuality = {};
                    }
                    
                    if (value !== null) {
                        if (parentAv1anValue?.targetQuality?.maximumProbes === value) {
                            delete formValueRef.value.targetQuality?.maximumProbes;
                        } else {
                            formValueRef.value.targetQuality.maximumProbes = value;
                        }
                    }
                },
                placeholder: '4',
                defaultValue: parentAv1anValue?.targetQuality?.maximumProbes,
                onClear: () => {
                    delete formValueRef.value.targetQuality?.maximumProbes;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.targetQuality) {
                formValueRef.value.targetQuality = {};
            }

            formValueRef.value.targetQuality.maximumProbes = null;
        },
        disabled: () => {
            return formValueRef.value.targetQuality?.maximumProbes === null;
        },
        reset: () => {
            delete formValueRef.value.targetQuality?.maximumProbes;
        },
    };

    const probeSlow = {
        label: 'Probe Slow',
        path: 'targetQuality.probeSlow',
        component: h(
            NSwitch,
            {
                value: formValueRef.value.targetQuality?.probeSlow ?? undefined,
                clearable: true,
                defaultValue: parentAv1anValue?.targetQuality?.probeSlow ?? undefined,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.targetQuality) {
                        formValueRef.value.targetQuality = {};
                    }
                    
                    if (value !== null) {
                        if (parentAv1anValue?.targetQuality?.probeSlow === value) {
                            delete formValueRef.value.targetQuality?.probeSlow;
                        } else {
                            formValueRef.value.targetQuality.probeSlow = value;
                        }
                    }
                },
                onClear: () => {
                    delete formValueRef.value.targetQuality?.probeSlow;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.targetQuality) {
                formValueRef.value.targetQuality = {};
            }

            formValueRef.value.targetQuality.probeSlow = null;
        },
        disabled: () => {
            return formValueRef.value.targetQuality?.probeSlow === null;
        },
        reset: () => {
            delete formValueRef.value.targetQuality?.probeSlow;
        },
    };

    const minimumQ = {
        label: 'Minimum Q',
        path: 'targetQuality.minimumQ',
        component: h(
            NInputNumber,
            {
                value: formValueRef.value.targetQuality?.minimumQ,
                min: 0,
                clearable: true,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.targetQuality) {
                        formValueRef.value.targetQuality = {};
                    }
                    
                    if (value !== null) {
                        if (parentAv1anValue?.targetQuality?.minimumQ === value) {
                            delete formValueRef.value.targetQuality?.minimumQ;
                        } else {
                            formValueRef.value.targetQuality.minimumQ = value;
                        }
                    }
                },
                placeholder: '',
                defaultValue: parentAv1anValue?.targetQuality?.minimumQ,
                onClear: () => {
                    delete formValueRef.value.targetQuality?.minimumQ;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.targetQuality) {
                formValueRef.value.targetQuality = {};
            }

            formValueRef.value.targetQuality.minimumQ = null;
        },
        disabled: () => {
            return formValueRef.value.targetQuality?.minimumQ === null;
        },
        reset: () => {
            delete formValueRef.value.targetQuality?.minimumQ;
        },
    };

    const maximumQ = {
        label: 'Maximum Q',
        path: 'targetQuality.maximumQ',
        component: h(
            NInputNumber,
            {
                value: formValueRef.value.targetQuality?.maximumQ,
                min: 0,
                clearable: true,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.targetQuality) {
                        formValueRef.value.targetQuality = {};
                    }
                    
                    if (value !== null) {
                        if (parentAv1anValue?.targetQuality?.maximumQ === value) {
                            delete formValueRef.value.targetQuality?.maximumQ;
                        } else {
                            formValueRef.value.targetQuality.maximumQ = value;
                        }
                    }
                },
                placeholder: '',
                defaultValue: parentAv1anValue?.targetQuality?.maximumQ,
                onClear: () => {
                    delete formValueRef.value.targetQuality?.maximumQ;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.targetQuality) {
                formValueRef.value.targetQuality = {};
            }

            formValueRef.value.targetQuality.maximumQ = null;
        },
        disabled: () => {
            return formValueRef.value.targetQuality?.maximumQ === null;
        },
        reset: () => {
            delete formValueRef.value.targetQuality?.maximumQ;
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