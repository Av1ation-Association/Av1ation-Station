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
import {
    type PartialChildren,
    type PartialAv1anConfiguration,
} from '../Configuration/ConfigurationDefaults.vue';
import { type FormInputComponent } from './library';
import { type Task } from '../../../../main/src/data/Configuration/Projects';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration | PartialChildren<Task['item']['Av1an']>>, parentAv1anValue?: PartialAv1anConfiguration): FormInputComponent[] {
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
                                if (parentAv1anValue?.vmaf?.path === value) {
                                    delete formValueRef.value.vmaf.path;
                                } else {
                                    formValueRef.value.vmaf.path = value;
                                }
                            }
                        },
                        placeholder: 'VMAF Model File Path',
                        defaultValue: parentAv1anValue?.vmaf?.path,
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
                            const vmafFilePath = await window.configurationsApi['save-file'](defaultPath ?? undefined, 'VMAF Model');
                            if (vmafFilePath) {
                                if (!formValueRef.value.vmaf) {
                                    formValueRef.value.vmaf = {};
                                }

                                if (parentAv1anValue?.vmaf?.path === vmafFilePath) {
                                    delete formValueRef.value.vmaf.path;
                                } else {
                                    formValueRef.value.vmaf.path = vmafFilePath;
                                }
                            }
                        },
                    },
                    () => [
                        'Select',
                    ],
                ),
            ],
        ),
        disable: () => {
            if (!formValueRef.value.vmaf) {
                formValueRef.value.vmaf = {};
            }

            formValueRef.value.vmaf.path = null;
        },
        disabled: () => {
            return formValueRef.value.vmaf?.path === null;
        },
        reset: () => {
            delete formValueRef.value.vmaf?.path;
        },
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
                    
                    if (value !== null) {
                        if (parentAv1anValue?.vmaf?.resolution === value) {
                            delete formValueRef.value.vmaf.resolution;
                        } else {
                            formValueRef.value.vmaf.resolution = value;
                        }
                    }
                },
                placeholder: '1920x1080',
                defaultValue: parentAv1anValue?.vmaf?.resolution,
                onClear: () => {
                    delete formValueRef.value.vmaf?.resolution;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.vmaf) {
                formValueRef.value.vmaf = {};
            }

            formValueRef.value.vmaf.resolution = null;
        },
        disabled: () => {
            return formValueRef.value.vmaf?.resolution === null;
        },
        reset: () => {
            delete formValueRef.value.vmaf?.resolution;
        },
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

                    if (value !== null) {
                        if (parentAv1anValue?.vmaf?.threads === value) {
                            delete formValueRef.value.vmaf.threads;
                        } else {
                            formValueRef.value.vmaf.threads = value;
                        }
                    }
                },
                placeholder: '',
                defaultValue: parentAv1anValue?.vmaf?.threads,
                onClear: () => {
                    delete formValueRef.value.vmaf?.threads;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.vmaf) {
                formValueRef.value.vmaf = {};
            }

            formValueRef.value.vmaf.threads = null;
        },
        disabled: () => {
            return formValueRef.value.vmaf?.threads === null;
        },
        reset: () => {
            delete formValueRef.value.vmaf?.threads;
        },
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
                    
                    if (value !== null) {
                        if (parentAv1anValue?.vmaf?.filter === value) {
                            delete formValueRef.value.vmaf.filter;
                        } else {
                            formValueRef.value.vmaf.filter = value;
                        }
                    }
                },
                placeholder: '',
                defaultValue: parentAv1anValue?.vmaf?.filter,
                onClear: () => {
                    delete formValueRef.value.vmaf?.filter;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.vmaf) {
                formValueRef.value.vmaf = {};
            }

            formValueRef.value.vmaf.filter = null;
        },
        disabled: () => {
            return formValueRef.value.vmaf?.filter === null;
        },
        reset: () => {
            delete formValueRef.value.vmaf?.filter;
        },
    };


    return [
        modelPath,
        resolution,
        threads,
        filter,
    ];
}