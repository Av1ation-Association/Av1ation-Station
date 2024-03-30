import {
    type Ref,
    h,
} from 'vue';
import {
    NInputNumber,
    NSlider,
    NSwitch,
} from 'naive-ui';
import { type PartialAv1anConfiguration } from '../Configuration/ConfigurationDefaults.vue';
import { type FormInputComponent } from './library';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration>): FormInputComponent[] {
    const targetVMAFScore = {
        label: 'Target VMAF Score',
        path: 'targetQuality.targetVMAFScore',
        component: h(
            NSlider,
            {
                value: formValueRef.value.targetQuality?.targetVMAFScore,
                min: 0,
                max: 100,
                step: 1,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.targetQuality) {
                        formValueRef.value.targetQuality = {};
                    }
                    
                    if (value !== null) {
                        formValueRef.value.targetQuality.targetVMAFScore = value;
                    }
                },
                onClear: () => {
                    delete formValueRef.value.targetQuality?.targetVMAFScore;
                },
            },
        ),
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
                        formValueRef.value.targetQuality.maximumProbes = value;
                    }
                },
                placeholder: '4',
                onClear: () => {
                    delete formValueRef.value.targetQuality?.maximumProbes;
                },
            },
        ),
    };

    const probeSlow = {
        label: 'Probe Slow',
        path: 'targetQuality.probeSlow',
        component: h(
            NSwitch,
            {
                value: formValueRef.value.targetQuality?.probeSlow,
                clearable: true,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.targetQuality) {
                        formValueRef.value.targetQuality = {};
                    }
                    
                    if (value !== null) {
                        formValueRef.value.targetQuality.probeSlow = value;
                    }
                },
                onClear: () => {
                    delete formValueRef.value.targetQuality?.probeSlow;
                },
            },
        ),
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
                        formValueRef.value.targetQuality.minimumQ = value;
                    }
                },
                placeholder: '',
                onClear: () => {
                    delete formValueRef.value.targetQuality?.minimumQ;
                },
            },
        ),
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
                        formValueRef.value.targetQuality.maximumQ = value;
                    }
                },
                placeholder: '',
                onClear: () => {
                    delete formValueRef.value.targetQuality?.maximumQ;
                },
            },
        ),
    };

    return [
        targetVMAFScore,
        maximumProbes,
        probeSlow,
        minimumQ,
        maximumQ,
    ];
}