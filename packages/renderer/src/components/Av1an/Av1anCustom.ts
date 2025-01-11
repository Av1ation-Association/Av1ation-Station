import {
    h,
    ref,
    toRaw,
} from 'vue';
import {
    NButton,
    NInput,
    NInputNumber,
    NSelect,
    NSwitch,
} from 'naive-ui';
import { type FormInputComponent } from './library';
import {
    type ConfigurationType,
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

    const merged = projectsStore.mergeAv1anCustomOptions(
        structuredClone(toRaw(parentAv1anCustom)),
        structuredClone(toRaw(configurationsStore.defaults.Av1anCustom)),
    );

    const { encoding: _encoding, ...av1anCustom } = merged;

    return Object.entries(av1anCustom).map(([name, value]) => {
        const component = value.type === 'string' ? h(
            NInput,
            {
                value: value.value as string,
                clearable: true,
                placeholder: parentAv1anCustom?.[name]?.value as string ?? 'None',
                // defaultValue: parentAv1anCustom?.[name]?.value,
                onUpdateValue: (value) => {
                    if (value !== null) {
                        if (parentAv1anCustom?.[name]?.value === value) {
                            delete configurationsStore.defaults.Av1anCustom[name];
                        } else {
                            configurationsStore.defaults.Av1anCustom[name].value = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1anCustom[name];
                },
            },
        ) : value.type === 'number' ? h(
            NInputNumber,
            {
                value: value.value as number,
                clearable: true,
                placeholder: parentAv1anCustom?.[name]?.value?.toString() ?? 'None',
                // defaultValue: parentAv1anCustom?.[name]?.value,
                onUpdateValue: (value) => {
                    if (value !== null) {
                        if (parentAv1anCustom?.[name]?.value === value) {
                            delete configurationsStore.defaults.Av1anCustom[name];
                        } else {
                            configurationsStore.defaults.Av1anCustom[name].value = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1anCustom[name];
                },
            },
        ) : h(
            NSwitch,
            {
                value: value.value as boolean,
                onUpdateValue: (value) => {
                    if (value !== null) {
                        if (parentAv1anCustom?.[name]?.value === value) {
                            delete configurationsStore.defaults.Av1anCustom[name];
                        } else {
                            configurationsStore.defaults.Av1anCustom[name].value = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1anCustom[name];
                },
            },
        );

        return {
            label: name,
            path: `Av1anCustom.${name}`,
            component,
            disable: () => {
                configurationsStore.defaults.Av1anCustom[name].value = null;
            },
            disabled: () => {
                return configurationsStore.defaults.Av1anCustom[name].value === null;
            },
            reset: () => {
                delete configurationsStore.defaults.Av1anCustom[name];
            },
            isModified: () => {
                if (previousAv1anCustom[name] === undefined) {
                    return configurationsStore.defaults.Av1anCustom[name] !== undefined;
                }
                return configurationsStore.defaults.Av1anCustom[name]?.value !== previousAv1anCustom[name]?.value;
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
            path: 'Av1anCustom.add.flagPrefix',
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
            path: 'Av1anCustom.add.name',
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
            path: 'Av1anCustom.add.delimiter',
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
            path: 'Av1anCustom.add.type',
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
            path: 'Av1anCustom.add.value',
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
            path: 'Av1anCustom.add.addNewCustomArgument',
            component: h(
                NButton,
                {
                    type: 'primary',
                    disabled: !newCustomValue.value.name.length,
                    onClick: () => {
                        if (newCustomValue.value.name) {
                            configurationsStore.defaults.Av1anCustom[newCustomValue.value.name] = structuredClone(toRaw(newCustomValue.value));
                            
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
