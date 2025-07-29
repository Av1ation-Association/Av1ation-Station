import {
    h,
} from 'vue';
import {
    NSelect,
} from 'naive-ui';
import { type FormInputComponent } from './library';
import { type Project } from '../../../../shared/src/data/Projects';
import { useGlobalStore } from '../../stores/global';
import { useProjectsStore } from '../../stores/projects';
import { useConfigurationsStore } from '../../stores/configurations';
import { Av1anInputLocationTypeToString, Av1anOutputLocationTypeToString, Av1anTemporaryLocationTypeToString, type Av1anOutputExtension} from '../../../../shared/src/data/Av1anConfiguration';
import { Av1anInputLocationType, Av1anOutputLocationType, Av1anTemporaryLocationType } from '../../../../shared/src/data/Av1anConfiguration';
import { type ConfigurationType } from '../../../../shared/src/data/Configuration';

export function getComponents(project?: Project): FormInputComponent[] {
    const configStore = useGlobalStore();
    const projectsStore = useProjectsStore();
    const configurationsStore = project ? useConfigurationsStore<ConfigurationType.Project>() : useConfigurationsStore<ConfigurationType.Config>();

    const projectIndex = project ? projectsStore.projects.findIndex(p => p.id === project.id) : -1;

    const input: FormInputComponent = {
        label: 'Input',
        path: 'input',
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.input?.type === Av1anInputLocationType.Custom ? configurationsStore.defaults.Av1an.input.customFolder : configurationsStore.defaults.Av1an.input?.type,
                clearable: !!project,
                options: [
                    {  label: 'Videos', value: Av1anInputLocationType.Videos },
                    {  label: 'Desktop', value: Av1anInputLocationType.Desktop },
                    {  label: 'Downloads', value: Av1anInputLocationType.Downloads },
                    {  label: 'Custom', value: Av1anInputLocationType.Custom },
                ],
                placeholder: configStore.config.defaults.Av1an.input.type ? Av1anInputLocationTypeToString(configStore.config.defaults.Av1an.input.type) : 'Videos',
                onUpdateValue: async (value?: Av1anInputLocationType) => {
                    if (!value) {
                        // Projects only
                        delete configurationsStore.defaults.Av1an.input;
                        // TODO: For use when adding vpy script editor feature
                        // const { type: _type, customFolder: _customFolder, ...input } = projectsStore.projects[projectIndex].defaults.Av1an.input as { type: Av1anInputLocationType; customFolder?: string; };

                        // projectsStore.projects[projectIndex].defaults.Av1an.input = {
                        //     ...input,
                        // };
                    } else {
                        if (value === Av1anInputLocationType.Custom) {
                            // Get path from user
                            const defaultPath = await projectsStore.getDefaultTaskInputDirectory(project && projectsStore.projects[projectIndex]);
                            const path = await window.configurationsApi['open-file'](defaultPath, 'Select Default Input Folder', undefined, ['openDirectory']);

                            if (path && path.length) {
                                configurationsStore.defaults.Av1an.input = {
                                    type: Av1anInputLocationType.Custom,
                                    customFolder: path[0],
                                };
                            }
                        } else {
                            configurationsStore.defaults.Av1an.input = {
                                type: value,
                            };
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.input;
                },
            },
        ),
        reset: () => {
            delete configurationsStore.defaults.Av1an.input;
        },
        isModified: () => {
            const previousInput = project ? projectsStore.projects[projectIndex].defaults.Av1an.input : configStore.config.defaults.Av1an.input;

            if (!previousInput) {
                return configurationsStore.defaults.Av1an.input?.type !== undefined;
            } else if (previousInput.type !== configurationsStore.defaults.Av1an.input?.type) {
                return true;
            } else if (previousInput.type === Av1anInputLocationType.Custom && configurationsStore.defaults.Av1an.input?.type === Av1anInputLocationType.Custom && previousInput.customFolder !== configurationsStore.defaults.Av1an.input.customFolder) {
                return true;
            } else {
                return false;
            }
        },
    };

    const output: FormInputComponent = {
        label: 'Output',
        path: 'output',
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.output?.type === Av1anOutputLocationType.Custom ? configurationsStore.defaults.Av1an.output.customFolder : configurationsStore.defaults.Av1an.output?.type,
                clearable: !!project,
                options: [
                    { label: 'Input Adjacent', value: Av1anOutputLocationType.InputAdjacent },
                    { label: 'Input Adjacent Av1an Folder', value: Av1anOutputLocationType.InputAdjacentAv1anFolder },
                    { label: 'Videos', value: Av1anOutputLocationType.Videos },
                    { label: 'Desktop', value: Av1anOutputLocationType.Desktop },
                    { label: 'Downloads', value: Av1anOutputLocationType.Downloads },
                    { label: 'Custom', value: Av1anOutputLocationType.Custom },
                ],
                placeholder: configStore.config.defaults.Av1an.output.type ? Av1anOutputLocationTypeToString(configStore.config.defaults.Av1an.output.type) : 'Input Adjacent',
                onUpdateValue: async (value?: Av1anOutputLocationType) => {
                    const { type: _type, customFolder: _customFolder, ...previousOutput } = (configurationsStore.defaults.Av1an.output ?? {}) as { type: Av1anOutputLocationType; customFolder?: string; extension?: Av1anOutputExtension; overwrite?: boolean; };
                    if (!value) {
                        // Projects only

                        configurationsStore.defaults.Av1an.output = {
                            ...previousOutput,
                        };
                    } else {
                        if (value === Av1anOutputLocationType.Custom) {
                            // Get path from user
                            const defaultPath = await projectsStore.getDefaultTaskInputDirectory(project && projectsStore.projects[projectIndex]);
                            const path = await window.configurationsApi['open-file'](defaultPath, 'Select Default Output Folder', undefined, ['openDirectory']);

                            if (path && path.length) {
                                configurationsStore.defaults.Av1an.output = {
                                    ...previousOutput,
                                    type: Av1anOutputLocationType.Custom,
                                    customFolder: path[0],
                                };
                            }
                        } else {
                            configurationsStore.defaults.Av1an.output = {
                                ...previousOutput,
                                type: value,
                            };
                        }
                    }
                },
                onClear: () => {
                    const { type: _type, customFolder: _customFolder, ...output } = configurationsStore.defaults.Av1an.output as { type: Av1anOutputLocationType; customFolder?: string; extension?: Av1anOutputExtension; overwrite?: boolean; };

                    configurationsStore.defaults.Av1an.output = {
                        ...output,
                    };
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            const { type: _type, customFolder: _customFolder, ...output } = configurationsStore.defaults.Av1an.output as { type: Av1anOutputLocationType; customFolder?: string; extension?: Av1anOutputExtension; overwrite?: boolean; };

            configurationsStore.defaults.Av1an.output = {
                ...output,
            };
        },
        isModified: () => {
            const previousOutput = project ? projectsStore.projects[projectIndex].defaults.Av1an.output : configStore.config.defaults.Av1an.output;

            if (!previousOutput) {
                return configurationsStore.defaults.Av1an.output?.type !== undefined;
            } else if (previousOutput.type !== configurationsStore.defaults.Av1an.output?.type) {
                return true;
            } else if (previousOutput.type === Av1anOutputLocationType.Custom && configurationsStore.defaults.Av1an.output?.type === Av1anOutputLocationType.Custom && previousOutput.customFolder !== configurationsStore.defaults.Av1an.output.customFolder) {
                return true;
            } else {
                return false;
            }
        },
    };

    const temporary: FormInputComponent = {
        label: 'Temporary',
        path: 'temporary',
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.temporary?.type === Av1anTemporaryLocationType.Custom ? configurationsStore.defaults.Av1an.temporary.customFolder : configurationsStore.defaults.Av1an.temporary?.type,
                clearable: !!project,
                options: [
                    { label: 'Input Adjacent Av1an Folder', value: Av1anTemporaryLocationType.InputAdjacentAv1anFolder },
                    { label: 'Av1ation Station Documents Folder', value: Av1anTemporaryLocationType.Av1ationStationDocumentsFolder },
                    { label: 'Custom', value: Av1anTemporaryLocationType.Custom },
                ],
                placeholder: configStore.config.defaults.Av1an.temporary.type ? Av1anTemporaryLocationTypeToString(configStore.config.defaults.Av1an.temporary.type) : 'Input Adjacent Av1an Folder',
                onUpdateValue: async (value?: Av1anTemporaryLocationType) => {
                    const { type: _type, customFolder: _customFolder, ...previousTemporary } = (configurationsStore.defaults.Av1an.temporary ?? {}) as { type: Av1anTemporaryLocationType; customFolder?: string; };
                    if (!value) {
                        // Projects only
                        delete configurationsStore.defaults.Av1an.temporary;
                        // const { type: _type, customFolder: _customFolder, ...temporary } = projectsStore.projects[projectIndex].defaults.Av1an.temporary as { type: Av1anTemporaryLocationType; customFolder?: string; };

                        // configurationsStore.value.temporary = {
                        //     ...previousTemporary,
                        // };
                    } else {
                        if (value === Av1anTemporaryLocationType.Custom) {
                            // Get path from user
                            const defaultPath = await projectsStore.getDefaultTaskInputDirectory(project && projectsStore.projects[projectIndex]);
                            const path = await window.configurationsApi['open-file'](defaultPath, 'Select Default Temporary Folder', undefined, ['openDirectory']);

                            if (path && path.length) {
                                configurationsStore.defaults.Av1an.temporary = {
                                    ...previousTemporary,
                                    type: Av1anTemporaryLocationType.Custom,
                                    customFolder: path[0],
                                };
                            }
                        } else {
                            configurationsStore.defaults.Av1an.temporary = {
                                ...previousTemporary,
                                type: value,
                            };
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.temporary;
                },
            },
        ),
        reset: () => {
            delete configurationsStore.defaults.Av1an.temporary;
        },
        isModified: () => {
            const previousTemporary = project ? projectsStore.projects[projectIndex].defaults.Av1an.temporary : configStore.config.defaults.Av1an.temporary;

            if (!previousTemporary) {
                return configurationsStore.defaults.Av1an.temporary?.type !== undefined;
            } else if (previousTemporary.type !== configurationsStore.defaults.Av1an.temporary?.type) {
                return true;
            } else if (previousTemporary.type === Av1anTemporaryLocationType.Custom && configurationsStore.defaults.Av1an.temporary?.type === Av1anTemporaryLocationType.Custom && previousTemporary.customFolder !== configurationsStore.defaults.Av1an.temporary.customFolder) {
                return true;
            } else {
                return false;
            }
        },
    };

    return [
        input,
        output,
        temporary,
    ];
}
