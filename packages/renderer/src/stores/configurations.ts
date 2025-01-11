import { toRaw } from 'vue';
import { defineStore } from 'pinia';
import {
    type Project,
    type Task,
} from '../../../shared/src/data/Projects.js';
import {
    type Defaults,
    type Preferences,
    type ConfigPreferences,
} from '../../../shared/src/data/Configuration.js';
import { type ConfigurationType } from '../../../shared/src/data/Configuration.js';
import {
    getDependenciesComponents,
    getFileLocationsComponents,
} from '../components/Dependencies/library.js';
import {
    type FormInputComponent,
    getAv1anChunkingComponents,
    getAv1anEncodingComponents,
    getAv1anGeneralComponents,
    getAv1anScenesComponents,
    getAv1anTargetQualityComponents,
    getAv1anVMAFComponents,
    getAv1anCustomComponents,
    getAv1anEncodingCustomComponents,
    getSVTAV1SpecificComponents,
    getSVTGeneralComponents,
    getSVTGlobalComponents,
    getSVTGOPComponents,
    getSVTRateControlComponents,
} from '../components/Av1an/library.js';
import { type Encoder } from '../../../shared/src/data/Types/Options.js';
import { useProjectsStore } from './projects.js';
import { useGlobalStore } from './global.js';

interface ModifiedComponents {
    fileLocationComponents: FormInputComponent[];
    dependencyComponents: FormInputComponent[];
    av1anGeneralComponents: FormInputComponent[];
    av1anScenesComponents: FormInputComponent[];
    av1anChunkingComponents: FormInputComponent[];
    av1anVMAFComponents: FormInputComponent[];
    av1anTargetQualityComponents: FormInputComponent[];
    av1anEncodingComponents: FormInputComponent[];
    av1anCustomComponents: FormInputComponent[];
    av1anEncodingCustomComponents: FormInputComponent[];
    svtGeneralComponents: FormInputComponent[];
    svtGlobalComponents: FormInputComponent[];
    svtGOPComponents: FormInputComponent[];
    svtRateControlComponents: FormInputComponent[];
    svtAV1SpecificComponents: FormInputComponent[];
}

export const useConfigurationsStore = <T extends ConfigurationType, U extends Encoder = Encoder.aom>() => defineStore('configurations', {
    state: () => {
        return {
            configurationType: '' as ConfigurationType,
            projectId: undefined as Project['id'] | undefined,
            taskId: undefined as Task['id'] | undefined,
            defaults: {} as Defaults<T, U>,
            previousDefaults: {} as Defaults<T, U>,
            parentAv1an: {} as Defaults<T, U>['Av1an'], // TODO: separate and create getter for merged Av1an
            parentAv1anCustom: {} as Defaults<T, U>['Av1anCustom'], // TODO: separate and create getter for merged Av1anCustom
            preferences: {} as (T extends ConfigurationType.Task ? object : T extends ConfigurationType.Project ? Preferences<ConfigurationType.Project> : Preferences<ConfigurationType.Config>),
            // Modals
            showUnsavedChangedModal: false,
            modifiedComponents: {
                fileLocationComponents: [],
                dependencyComponents: [],
                av1anGeneralComponents: [],
                av1anScenesComponents: [],
                av1anChunkingComponents: [],
                av1anVMAFComponents: [],
                av1anTargetQualityComponents: [],
                av1anEncodingComponents: [],
                av1anEncodingCustomComponents: [],
                av1anCustomComponents: [],
                svtGeneralComponents: [],
                svtGlobalComponents: [],
                svtGOPComponents: [],
                svtRateControlComponents: [],
                svtAV1SpecificComponents: [],
            } as ModifiedComponents,
        };
    },
    actions: {
        initialize(configurationType: ConfigurationType, projectId?: Project['id'], taskId?: Task['id'], reset = false) {
            const configStore = useGlobalStore();
            const projectsStore = useProjectsStore();

            if (reset || (configurationType !== this.configurationType) || taskId !== this.taskId || projectId !== this.projectId) {
                const projectIndex = projectsStore.projects.findIndex(p => p.id === projectId);
                const taskIndex = projectIndex !== -1 ? projectsStore.projects[projectIndex].tasks.findIndex(t => t.id === taskId) : -1;

                this.configurationType = configurationType;
                if (projectIndex !== -1) {
                    this.projectId = projectsStore.projects[projectIndex].id;

                    if (taskIndex !== -1) {
                        this.taskId = projectsStore.projects[projectIndex].tasks[taskIndex].id;
                        this.defaults = structuredClone(toRaw(projectsStore.projects[projectIndex].tasks[taskIndex].item)) as typeof this.defaults;
                        this.previousDefaults = structuredClone(toRaw(projectsStore.projects[projectIndex].tasks[taskIndex].item)) as typeof this.defaults;
                        this.parentAv1an = projectsStore.applyAv1anOptions(
                            structuredClone(toRaw(configStore.config.defaults.Av1an as unknown as Task['item']['Av1an'])),
                            structuredClone(toRaw(projectsStore.projects[projectIndex].defaults.Av1an)),
                        ) as typeof this.parentAv1an;
                        this.parentAv1anCustom = projectsStore.mergeAv1anCustomOptions(
                            structuredClone(toRaw(configStore.config.defaults.Av1anCustom)),
                            structuredClone(toRaw(projectsStore.projects[projectIndex].defaults.Av1anCustom)),
                        ) as typeof this.parentAv1anCustom;
                    } else {
                        this.taskId = undefined;
                        this.defaults = structuredClone(toRaw(projectsStore.projects[projectIndex].defaults)) as typeof this.defaults;
                        this.previousDefaults = structuredClone(toRaw(projectsStore.projects[projectIndex].defaults)) as typeof this.defaults;
                        this.parentAv1an = structuredClone(toRaw(configStore.config.defaults.Av1an)) as typeof this.parentAv1an;
                        this.parentAv1anCustom = structuredClone(toRaw(configStore.config.defaults.Av1anCustom)) as typeof this.parentAv1anCustom;
                        this.preferences = structuredClone(toRaw(projectsStore.projects[projectIndex].preferences)) as typeof this.preferences;
                    }
                } else {
                    // Initializing
                    this.projectId = undefined;
                    this.taskId = undefined;
                    this.parentAv1an = structuredClone(toRaw(configStore.config.defaults.Av1an)) as typeof this.parentAv1an;
                    this.parentAv1anCustom = structuredClone(toRaw(configStore.config.defaults.Av1anCustom)) as typeof this.parentAv1anCustom;
                    this.defaults = structuredClone(toRaw(configStore.config.defaults)) as typeof this.defaults;
                    this.previousDefaults = structuredClone(toRaw(configStore.config.defaults)) as typeof this.previousDefaults;
                    // this.defaults = JSON.parse(JSON.stringify(configStore.config.defaults));
                    this.preferences = structuredClone(toRaw(configStore.config.preferences)) as typeof this.preferences;
                }

                this.updateModifiedComponents();
            }
        },
        async applyChanges(projectId?: Project['id'], taskId?: Task['id']) {
            const configStore = useGlobalStore();
            const projectsStore = useProjectsStore();

            const projectIndex = projectsStore.projects.findIndex(p => p.id === projectId);
            const taskIndex = projectIndex !== -1 ? projectsStore.projects[projectIndex].tasks.findIndex(t => t.id === taskId) : -1;

            // Discard removed custom options
            Object.entries((this.defaults as Defaults<ConfigurationType.Config>).Av1anCustom).forEach(([name, value]) => {
                // Custom encoder options handled separately
                if (name !== 'encoding' && value.type === 'undefined') {
                    delete (this.defaults as Defaults<ConfigurationType.Config>).Av1anCustom[name];
                }
            });
            Object.entries((this.defaults as Defaults<ConfigurationType.Config>).Av1anCustom.encoding ?? {}).forEach(([name, value]) => {
                if (value.type === 'undefined') {
                    delete (this.defaults as Defaults<ConfigurationType.Config>).Av1anCustom.encoding![name];
                }
            });

            // Overwrite Av1an Configuration
            if (taskIndex !== -1) {
                projectsStore.projects[projectIndex].tasks[taskIndex].item = this.defaults as Defaults<ConfigurationType.Task>;

                // Save Project
                await projectsStore.saveProject(projectsStore.projects[projectIndex].id, false);
            } else if (projectIndex !== -1) {
                projectsStore.projects[projectIndex].defaults = this.defaults as Defaults<ConfigurationType.Project>;
                projectsStore.projects[projectIndex].preferences = this.preferences as Preferences<ConfigurationType.Project>;

                // Save Project
                await projectsStore.saveProject(projectsStore.projects[projectIndex].id, true);
            } else {
                configStore.config.defaults = this.defaults as Defaults<ConfigurationType.Config>;
                configStore.config.preferences = this.preferences as ConfigPreferences;

                // Save Config
                await configStore.setConfig(toRaw(configStore.config), true);
            }

            // Reinitialize
            this.initialize(this.configurationType, this.projectId, this.taskId, true);
        },
        getModifiedComponents(projectId?: Project['id'], taskId?: Task['id']) {
            const projectsStore = useProjectsStore();

            const projectIndex = projectsStore.projects.findIndex(p => p.id === projectId);
            const taskIndex = projectIndex !== -1 ? projectsStore.projects[projectIndex].tasks.findIndex(t => t.id === taskId) : -1;

            const av1anGeneralComponents = getAv1anGeneralComponents().filter(component => component.isModified());
            const av1anScenesComponents = getAv1anScenesComponents(taskIndex !== -1 ? projectsStore.projects[projectIndex].tasks[taskIndex] : undefined).filter(component => component.isModified());
            const av1anChunkingComponents = getAv1anChunkingComponents().filter(component => component.isModified());
            const av1anVMAFComponents = getAv1anVMAFComponents().filter(component => component.isModified());
            const av1anTargetQualityComponents = getAv1anTargetQualityComponents().filter(component => component.isModified());
            const av1anEncodingComponents = getAv1anEncodingComponents().filter(component => component.isModified());
            const av1anCustomComponents = getAv1anCustomComponents().filter(component => component.isModified());
            const av1anEncodingCustomComponents = getAv1anEncodingCustomComponents().filter(component => component.isModified());

            const svtGeneralComponents = getSVTGeneralComponents().filter(component => component.isModified());
            const svtGlobalComponents = getSVTGlobalComponents().filter(component => component.isModified());
            const svtGOPComponents = getSVTGOPComponents().filter(component => component.isModified());
            const svtRateControlComponents = getSVTRateControlComponents().filter(component => component.isModified());
            const svtAV1SpecificComponents = getSVTAV1SpecificComponents().filter(component => component.isModified());

            if (taskIndex !== -1) {
                return {
                    fileLocationComponents: [],
                    dependencyComponents: [],
                    av1anGeneralComponents,
                    av1anScenesComponents,
                    av1anChunkingComponents,
                    av1anVMAFComponents,
                    av1anTargetQualityComponents,
                    av1anEncodingComponents,
                    av1anCustomComponents,
                    av1anEncodingCustomComponents,
                    svtGeneralComponents,
                    svtGlobalComponents,
                    svtGOPComponents,
                    svtRateControlComponents,
                    svtAV1SpecificComponents,
                };
            } else {
                // Evaluate FileLocations
                const fileLocationsComponents = getFileLocationsComponents(projectIndex !== -1 ? projectsStore.projects[projectIndex] : undefined);
                const dependenciesComponents = getDependenciesComponents(projectIndex !== -1 ? projectsStore.projects[projectIndex] : undefined);

                const modifiedFileLocationComponents = fileLocationsComponents.filter(component => component.isModified());
                const modifiedDependencyComponents = dependenciesComponents.filter(component => component.isModified());

                return {
                    fileLocationComponents: modifiedFileLocationComponents,
                    dependencyComponents: modifiedDependencyComponents,
                    av1anGeneralComponents,
                    av1anScenesComponents,
                    av1anChunkingComponents,
                    av1anVMAFComponents,
                    av1anTargetQualityComponents,
                    av1anEncodingComponents,
                    av1anCustomComponents,
                    av1anEncodingCustomComponents,
                    svtGeneralComponents,
                    svtGlobalComponents,
                    svtGOPComponents,
                    svtRateControlComponents,
                    svtAV1SpecificComponents,
                };
            }
        },
        updateModifiedComponents() {
            const modifiedComponents = this.getModifiedComponents(this.projectId, this.taskId);
            this.modifiedComponents = {
                fileLocationComponents: modifiedComponents.fileLocationComponents,
                dependencyComponents: modifiedComponents.dependencyComponents,
                av1anGeneralComponents: modifiedComponents.av1anGeneralComponents,
                av1anScenesComponents: modifiedComponents.av1anGeneralComponents,
                av1anChunkingComponents: modifiedComponents.av1anChunkingComponents,
                av1anVMAFComponents: modifiedComponents.av1anVMAFComponents,
                av1anTargetQualityComponents: modifiedComponents.av1anTargetQualityComponents,
                av1anEncodingComponents: modifiedComponents.av1anEncodingComponents,
                av1anCustomComponents: modifiedComponents.av1anCustomComponents,
                av1anEncodingCustomComponents: modifiedComponents.av1anEncodingCustomComponents,
                svtGeneralComponents: modifiedComponents.svtGeneralComponents,
                svtGlobalComponents: modifiedComponents.svtGlobalComponents,
                svtGOPComponents: modifiedComponents.svtGOPComponents,
                svtRateControlComponents: modifiedComponents.svtRateControlComponents,
                svtAV1SpecificComponents: modifiedComponents.svtAV1SpecificComponents,
            };

            return this.modifiedComponents;
        },
    },
})();
