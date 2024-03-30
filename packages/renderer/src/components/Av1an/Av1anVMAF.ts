import {
    type Ref,
    h,
} from 'vue';
import {
    NButton,
    NInput,
    NInputGroup,
    NInputNumber,
} from 'naive-ui';
import { type PartialAv1anConfiguration } from '../Configuration/ConfigurationDefaults.vue';
import { type FormInputComponent } from './library';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration>): FormInputComponent[] {
    const modelPath = {
        label: 'VMAF Model Path',
        path: 'vmaf.path',
        component: h(
            NInputGroup,
            undefined,
            () => [
                h(
                    NInput, {
                        value: formValueRef.value.vmaf?.path,
                        clearable: true,
                        onUpdateValue: (value) => {
                            if (!formValueRef.value.vmaf) {
                                formValueRef.value.vmaf = {};
                            }

                            if (value) {
                                formValueRef.value.vmaf.path = value;
                            }
                        },
                        placeholder: 'VMAF Model File Path',
                        onClear: () => {
                            delete formValueRef.value.vmaf?.path;
                        },
                    },
                ),
                h(
                    NButton,
                    {
                        type: 'primary',
                        onClick: async () => {
                            const defaultPath = formValueRef.value.vmaf?.path; // TODO: fallback to output directory
                            const vmafFilePath = await window.configurationsApi['save-file'](defaultPath, 'VMAF Model');
                            if (vmafFilePath) {
                                if (!formValueRef.value.vmaf) {
                                    formValueRef.value.vmaf = {};
                                }

                                formValueRef.value.vmaf.path = vmafFilePath;
                            }
                        },
                    },
                    () => [
                        'Select',
                    ],
                ),
            ],
        ),
    };

    const resolution = {
        label: 'VMAF Resolution',
        path: 'vmaf.resolution',
        component: h(
            NInput,
            {
                value: formValueRef.value.vmaf?.resolution,
                clearable: true,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.vmaf) {
                        formValueRef.value.vmaf = {};
                    }
                    
                    formValueRef.value.vmaf.resolution = value;
                },
                placeholder: '1920x1080',
                onClear: () => {
                    delete formValueRef.value.vmaf?.resolution;
                },
            },
        ),
    };

    const threads = {
        label: 'VMAF Threads',
        path: 'vmaf.threads',
        component: h(
            NInputNumber,
            {
                value: formValueRef.value.vmaf?.threads,
                clearable: true,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.vmaf) {
                        formValueRef.value.vmaf = {};
                    }

                    if (value) {
                        formValueRef.value.vmaf.threads = value;
                    }
                },
                placeholder: '',
                onClear: () => {
                    delete formValueRef.value.vmaf?.threads;
                },
            },
        ),
    };

    const filter = {
        label: 'VMAF Filter',
        path: 'vmaf.filter',
        component: h(
            NInput,
            {
                value: formValueRef.value.vmaf?.filter,
                clearable: true,
                onUpdateValue: (value) => {
                    if (!formValueRef.value.vmaf) {
                        formValueRef.value.vmaf = {};
                    }
                    
                    formValueRef.value.vmaf.filter = value;
                },
                placeholder: '',
                onClear: () => {
                    delete formValueRef.value.vmaf?.filter;
                },
            },
        ),
    };

    return [
        modelPath,
        resolution,
        threads,
        filter,
    ];
}