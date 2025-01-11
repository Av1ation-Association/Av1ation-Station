import { h } from 'vue';
import {
    NButton,
    NInput,
    NInputGroup,
    NInputNumber,
} from 'naive-ui';
import { type ConfigurationType } from '../../../../shared/src/data/Configuration';
import { useConfigurationsStore } from '../../stores/configurations';
import { type FormInputComponent } from './library';

export function getComponents(): FormInputComponent[] {
    const configurationsStore = useConfigurationsStore<ConfigurationType.Task>();
    const parentAv1an = configurationsStore.parentAv1an;
    const previousAv1an = configurationsStore.previousDefaults.Av1an;

    const modelPath = {
        label: 'VMAF Model Path',
        path: 'vmaf.path',
        component: h(
            NInputGroup,
            undefined,
            () => [
                h(
                    NInput, {
                        value: configurationsStore.defaults.Av1an.vmaf?.path,
                        clearable: true,
                        onUpdateValue: (value) => {
                            if (!configurationsStore.defaults.Av1an.vmaf) {
                                configurationsStore.defaults.Av1an.vmaf = {};
                            }

                            if (value) {
                                if (parentAv1an.vmaf?.path === value) {
                                    delete configurationsStore.defaults.Av1an.vmaf.path;
                                } else {
                                    configurationsStore.defaults.Av1an.vmaf.path = value;
                                }
                            }
                        },
                        placeholder: parentAv1an.vmaf?.path ?? 'VMAF Model File Path',
                        // defaultValue: parentAv1an.vmaf?.path,
                        onClear: () => {
                            delete configurationsStore.defaults.Av1an.vmaf?.path;
                        },
                    },
                ),
                h(
                    NButton,
                    {
                        type: 'primary',
                        onClick: async () => {
                            const defaultPath = configurationsStore.defaults.Av1an.vmaf?.path; // TODO: fallback to output directory
                            const vmafFilePath = await window.configurationsApi['save-file'](defaultPath ?? undefined, 'VMAF Model');
                            if (vmafFilePath) {
                                if (!configurationsStore.defaults.Av1an.vmaf) {
                                    configurationsStore.defaults.Av1an.vmaf = {};
                                }

                                if (parentAv1an.vmaf?.path === vmafFilePath) {
                                    delete configurationsStore.defaults.Av1an.vmaf.path;
                                } else {
                                    configurationsStore.defaults.Av1an.vmaf.path = vmafFilePath;
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
            if (!configurationsStore.defaults.Av1an.vmaf) {
                configurationsStore.defaults.Av1an.vmaf = {};
            }

            configurationsStore.defaults.Av1an.vmaf.path = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.vmaf?.path === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.vmaf?.path;
        },
        isModified: () => {
            if (!previousAv1an.vmaf || previousAv1an.vmaf.path === undefined) {
                return configurationsStore.defaults.Av1an.vmaf?.path !== undefined;
            } else if (previousAv1an.vmaf.path !== configurationsStore.defaults.Av1an.vmaf?.path) {
                return true;
            } else {
                return false;
            }
        },
    };

    const resolution = {
        label: 'VMAF Resolution',
        path: 'vmaf.resolution',
        component: h(
            NInput,
            {
                value: configurationsStore.defaults.Av1an.vmaf?.resolution,
                clearable: true,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.vmaf) {
                        configurationsStore.defaults.Av1an.vmaf = {};
                    }

                    if (value !== null) {
                        if (parentAv1an.vmaf?.resolution === value) {
                            delete configurationsStore.defaults.Av1an.vmaf.resolution;
                        } else {
                            configurationsStore.defaults.Av1an.vmaf.resolution = value;
                        }
                    }
                },
                placeholder: parentAv1an.vmaf?.resolution ?? '1920x1080',
                // defaultValue: parentAv1an.vmaf?.resolution,
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.vmaf?.resolution;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.vmaf) {
                configurationsStore.defaults.Av1an.vmaf = {};
            }

            configurationsStore.defaults.Av1an.vmaf.resolution = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.vmaf?.resolution === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.vmaf?.resolution;
        },
        isModified: () => {
            if (!previousAv1an.vmaf || previousAv1an.vmaf.resolution === undefined) {
                return configurationsStore.defaults.Av1an.vmaf?.resolution !== undefined;
            } else if (previousAv1an.vmaf.path !== configurationsStore.defaults.Av1an.vmaf?.resolution) {
                return true;
            } else {
                return false;
            }
        },
    };

    const threads = {
        label: 'VMAF Threads',
        path: 'vmaf.threads',
        component: h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1an.vmaf?.threads,
                clearable: true,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.vmaf) {
                        configurationsStore.defaults.Av1an.vmaf = {};
                    }

                    if (value !== null) {
                        if (parentAv1an.vmaf?.threads === value) {
                            delete configurationsStore.defaults.Av1an.vmaf.threads;
                        } else {
                            configurationsStore.defaults.Av1an.vmaf.threads = value;
                        }
                    }
                },
                placeholder: parentAv1an.vmaf?.threads?.toString() ?? '',
                // defaultValue: parentAv1an.vmaf?.threads,
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.vmaf?.threads;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.vmaf) {
                configurationsStore.defaults.Av1an.vmaf = {};
            }

            configurationsStore.defaults.Av1an.vmaf.threads = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.vmaf?.threads === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.vmaf?.threads;
        },
        isModified: () => {
            if (!previousAv1an.vmaf || previousAv1an.vmaf.threads === undefined) {
                return configurationsStore.defaults.Av1an.vmaf?.threads !== undefined;
            } else if (previousAv1an.vmaf.threads !== configurationsStore.defaults.Av1an.vmaf?.threads) {
                return true;
            } else {
                return false;
            }
        },
    };

    const filter = {
        label: 'VMAF Filter',
        path: 'vmaf.filter',
        component: h(
            NInput,
            {
                value: configurationsStore.defaults.Av1an.vmaf?.filter,
                clearable: true,
                onUpdateValue: (value) => {
                    if (!configurationsStore.defaults.Av1an.vmaf) {
                        configurationsStore.defaults.Av1an.vmaf = {};
                    }

                    if (value !== null) {
                        if (parentAv1an.vmaf?.filter === value) {
                            delete configurationsStore.defaults.Av1an.vmaf.filter;
                        } else {
                            configurationsStore.defaults.Av1an.vmaf.filter = value;
                        }
                    }
                },
                placeholder: parentAv1an.vmaf?.filter ?? '',
                // defaultValue: parentAv1an.vmaf?.filter,
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.vmaf?.filter;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.vmaf) {
                configurationsStore.defaults.Av1an.vmaf = {};
            }

            configurationsStore.defaults.Av1an.vmaf.filter = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.vmaf?.filter === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.vmaf?.filter;
        },
        isModified: () => {
            if (!previousAv1an.vmaf || previousAv1an.vmaf.filter === undefined) {
                return configurationsStore.defaults.Av1an.vmaf?.filter !== undefined;
            } else if (previousAv1an.vmaf.filter !== configurationsStore.defaults.Av1an.vmaf?.filter) {
                return true;
            } else {
                return false;
            }
        },
    };


    return [
        modelPath,
        resolution,
        threads,
        filter,
    ];
}
