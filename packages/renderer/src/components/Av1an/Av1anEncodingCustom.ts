import {
    h,
    ref,
    toRaw,
} from 'vue';
import {
    NInput,
    NInputNumber,
    NSwitch,
    NSelect,
    NButton,
} from 'naive-ui';
import { type FormInputComponent } from './library';
import {
    ConfigurationType,
    type CustomOption,
} from '../../../../shared/src/data/Configuration';
import { useProjectsStore } from '../../stores/projects';
import { useConfigurationsStore } from '../../stores/configurations';

// Add new custom option
const newCustomValue = ref<CustomOption>({
    name: '',
    delimiter: ' ',
    flagPrefix: '--',
    type: 'string',
    value: '',
});

export function getComponents(): FormInputComponent[] {
    const projectsStore = useProjectsStore();
    const configurationsStore = useConfigurationsStore<ConfigurationType.Task>();
    const parentAv1anCustom = configurationsStore.parentAv1anCustom;
    const previousAv1anCustom = configurationsStore.previousDefaults.Av1anCustom;

    const { encoding } = projectsStore.mergeAv1anCustomOptions(
        structuredClone(toRaw(parentAv1anCustom)),
        structuredClone(toRaw(configurationsStore.defaults.Av1anCustom)),
    );

    // console.log('MERGED AV1AN CUSTOM .ENCODING.FLB:', toRaw(encoding)?.['frame-luma-bias']);

    function updateValue(name: string, value: string | number | boolean | undefined | null) {
        if (configurationsStore.configurationType !== ConfigurationType.Config && parentAv1anCustom.encoding?.[name].value === value) {
            delete configurationsStore.defaults.Av1anCustom.encoding?.[name];
        } else {
            if (!configurationsStore.defaults.Av1anCustom.encoding?.[name]) {
                if (!configurationsStore.defaults.Av1anCustom.encoding) {
                    configurationsStore.defaults.Av1anCustom.encoding = {};
                }

                configurationsStore.defaults.Av1anCustom.encoding[name] = structuredClone(toRaw(parentAv1anCustom.encoding![name]));
            }
            configurationsStore.defaults.Av1anCustom.encoding[name].value = value;
        }

        configurationsStore.updateModifiedComponents();
    }

    return Object.entries(encoding ?? {}).map(([name, optionValue]) => {
        const component = optionValue.type === 'string' ? h(
            NInput,
            {
                value: configurationsStore.defaults.Av1anCustom.encoding?.[name].value as string,
                clearable: true,
                placeholder: parentAv1anCustom.encoding?.[name]?.value as string ?? 'None',
                // defaultValue: parentAv1anCustom[name].value,
                onUpdateValue: (value) => {
                    if (value !== null) {
                        updateValue(name, value);
                    }
                },
                onClear: () => {
                    // delete configurationsStore.defaults.Av1anCustom.encoding?.[name];
                    // Special case for keeping track of removed/reset item without rendering it
                    configurationsStore.defaults.Av1anCustom.encoding![name].type = 'undefined';
                    configurationsStore.defaults.Av1anCustom.encoding![name].value = undefined;
                },
            },
        ) : optionValue.type === 'number' ? h(
            NInputNumber,
            {
                value: configurationsStore.defaults.Av1anCustom.encoding?.[name]?.value as number,
                clearable: true,
                placeholder: parentAv1anCustom.encoding?.[name]?.value?.toString() ?? 'None',
                // defaultValue: parentAv1anCustom.encoding?.[name].value,
                onUpdateValue: (value: number | null) => {
                    if (value !== null) {
                        updateValue(name, value);
                    }
                },
                onClear: () => {
                    // delete configurationsStore.defaults.Av1anCustom.encoding?.[name];
                    // Special case for keeping track of removed/reset item without rendering it
                    configurationsStore.defaults.Av1anCustom.encoding![name].type = 'undefined';
                    configurationsStore.defaults.Av1anCustom.encoding![name].value = undefined;
                },
            },
        ) : optionValue.type === 'boolean' ? h(
            NSwitch,
            {
                value: optionValue.value as boolean,
                onUpdateValue: (value) => {
                    if (value !== null) {
                        updateValue(name, value);
                    }
                },
                onClear: () => {
                    // delete configurationsStore.defaults.Av1anCustom.encoding?.[name];
                    // Special case for keeping track of removed/reset item without rendering it
                    configurationsStore.defaults.Av1anCustom.encoding![name].type = 'undefined';
                    configurationsStore.defaults.Av1anCustom.encoding![name].value = undefined;
                },
            },
        ) : h(
            NInput,
            {
                value: optionValue.value as string,
                placeholder: 'Removed',
                disabled: true,
            },
        );

        return {
            label: name,
            path: `Av1anCustom.encoding.${name}`,
            component,
            disable: () => {
                configurationsStore.defaults.Av1anCustom.encoding![name].value = null;
            },
            disabled: () => {
                return configurationsStore.defaults.Av1anCustom.encoding?.[name]?.value === null;
            },
            reset: () => {
                // delete configurationsStore.defaults.Av1anCustom.encoding?.[name];
                // Special case for keeping track of removed/reset item without rendering it
                configurationsStore.defaults.Av1anCustom.encoding![name].type = 'undefined';
                configurationsStore.defaults.Av1anCustom.encoding![name].value = undefined;
            },
            isModified: () => {
                if (previousAv1anCustom.encoding?.[name] === undefined) {
                    return configurationsStore.defaults.Av1anCustom.encoding?.[name] !== undefined;
                }
                return configurationsStore.defaults.Av1anCustom.encoding?.[name]?.value !== previousAv1anCustom.encoding[name]?.value;
            },
        };
    });
}

export function getAddCustomComponents(defaultFlagPrefix = '--', defaultDelimiter = ' '): FormInputComponent[] {
    const configurationsStore = useConfigurationsStore<ConfigurationType.Task>();
    newCustomValue.value.flagPrefix = defaultFlagPrefix;
    newCustomValue.value.delimiter = defaultDelimiter;

    return [
        {
            label: 'Name Prefix',
            path: 'Av1anCustom.encoding.add.flagPrefix',
            component: h(
                NInput,
                {
                    value: newCustomValue.value.flagPrefix,
                    clearable: true,
                    placeholder: 'Prefix (empty string "", "--", "-", etc.)',
                    onUpdateValue: (prefix) => {
                        newCustomValue.value.flagPrefix = prefix;
                    },
                    onClear: () => {
                        newCustomValue.value.flagPrefix = defaultFlagPrefix;
                    },
                },
            ),
            disable: () => {
                // Not applicable
            },
            disabled: () => false,
            reset: () => {
                newCustomValue.value.flagPrefix = defaultFlagPrefix;
            },
            isModified: () => false,
        },
        {
            label: 'Name',
            path: 'Av1anCustom.encoding.add.name',
            component: h(
                NInput,
                {
                    value: newCustomValue.value.name,
                    clearable: true,
                    placeholder: 'Name',
                    onUpdateValue: (value) => {
                        newCustomValue.value.name = value;
                    },
                    onClear: () => {
                        newCustomValue.value.name = '';
                    },
                },
            ),
            disable: () => {
            // Not applicable
            },
            disabled: () => false,
            reset: () => {
            // Reset values to defaults
            },
            isModified: () => false,
        },
        {
            label: 'Name-Value Separator',
            path: 'Av1anCustom.encoding.add.delimiter',
            component: h(
                NInput,
                {
                    value: newCustomValue.value.delimiter,
                    clearable: true,
                    placeholder: 'Separator (space " ", comma ",", equals sign "=", etc.)',
                    onUpdateValue: (delimiter) => {
                        newCustomValue.value.delimiter = delimiter;
                    },
                    onClear: () => {
                        newCustomValue.value.delimiter = defaultDelimiter;
                    },
                },
            ),
            disable: () => {
                // Not applicable
            },
            disabled: () => false,
            reset: () => {
                newCustomValue.value.delimiter = defaultDelimiter;
            },
            isModified: () => false,
        },
        {
            label: 'Type',
            path: 'Av1anCustom.encoding.add.type',
            component: h(
                NSelect,
                {
                    value: newCustomValue.value.type,
                    clearable: true,
                    placeholder: 'String',
                    options: [
                        {
                            label: 'String',
                            value: 'string',
                        },
                        {
                            label: 'Number',
                            value: 'number',
                        },
                        {
                            label: 'Boolean',
                            value: 'boolean',
                        },
                    ],
                    onUpdateValue: (type) => {
                        newCustomValue.value.type = type;
                        newCustomValue.value.value = type === 'string' ? '' : type === 'number' ? 0 : false;
                    },
                    onClear: () => {
                        newCustomValue.value.type = 'string';
                    },
                },
            ),
            disable: () => {
                // Not applicable
            },
            disabled: () => false,
            reset: () => {
                newCustomValue.value.type = 'string';
            },
            isModified: () => false,
        },
        {
            label: 'Value',
            path: 'Av1anCustom.encoding.add.value',
            component: newCustomValue.value.type === 'string' ? h(
                NInput,
                {
                    value: newCustomValue.value.value as string,
                    clearable: true,
                    placeholder: 'Value',
                    onUpdateValue: (value) => {
                        newCustomValue.value.value = value;
                    },
                    onClear: () => {
                        newCustomValue.value.value = '';
                    },
                },
            ) : newCustomValue.value.type === 'number' ? h(
                NInputNumber,
                {
                    value: newCustomValue.value.value as number,
                    clearable: true,
                    placeholder: 'Value',
                    onUpdateValue: (value) => {
                        newCustomValue.value.value = value;
                    },
                    onClear: () => {
                        newCustomValue.value.value = 0;
                    },
                },
            ) : h(
                NSwitch,
                {
                    value: newCustomValue.value.value as boolean,
                    clearable: true,
                    onUpdateValue: (value) => {
                        newCustomValue.value.value = value;
                    },
                    onClear: () => {
                        newCustomValue.value.value = false;
                    },
                },
            ),
            disable: () => {
                // Not applicable
            },
            disabled: () => false,
            reset: () => {
                // Reset values to defaults
                newCustomValue.value.value = newCustomValue.value.type === 'string'
                    ? ''
                    : newCustomValue.value.type === 'number'
                        ? 0
                        : false;
            },
            isModified: () => false,
        },
        {
            label: '',
            path: 'Av1anCustom.encoding.add.addNewCustomArgument',
            component: h(
                NButton,
                {
                    type: 'primary',
                    disabled: !newCustomValue.value.name.length,
                    onClick: () => {
                        if (newCustomValue.value.name) {
                            if (!configurationsStore.defaults.Av1anCustom.encoding) {
                                configurationsStore.defaults.Av1anCustom.encoding = {};
                            }

                            configurationsStore.defaults.Av1anCustom.encoding[newCustomValue.value.name] = structuredClone(toRaw(newCustomValue.value));

                            // Update modifiedCompnents
                            configurationsStore.updateModifiedComponents();
                            // Reset name and value
                            newCustomValue.value.name = '';
                            newCustomValue.value.value = newCustomValue.value.type === 'string' ? '' : newCustomValue.value.type === 'number' ? 0 : false;
                        }
                    },
                },
                () => 'Add',
            ),
            disable: () => {},
            disabled: () => false,
            reset: () => {},
            isModified: () => false,
        },
    ];
}
