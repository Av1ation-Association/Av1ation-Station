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
import type { ConfigurationType, Preferences } from '../../../../shared/src/data/Configuration';
import { DependencyType, DependencyTypeToString } from '../../../../shared/src/data/Configuration';
import { useConfigurationsStore } from '../../stores/configurations';


export function getComponents(project?: Project): FormInputComponent[] {
    const configStore = useGlobalStore();
    const projectsStore = useProjectsStore();
    // Assume Project ConfigurationType to avoid repetitive casting
    const configurationsStore = useConfigurationsStore<ConfigurationType.Project>();

    const projectIndex = project ? projectsStore.projects.findIndex(p => p.id === project.id) : -1;

    const vapoursynth: FormInputComponent = {
        label: 'VapourSynth',
        path: 'vapoursynth',
        component: h(
            NSelect,
            {
                value: configurationsStore.preferences.dependencyPaths.vapoursynth?.type,
                clearable: !!project,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                ],
                placeholder: DependencyTypeToString(configStore.config.preferences.dependencyPaths.vapoursynth.type),
                onUpdateValue: (value?: DependencyType.System | DependencyType.Packaged) => {
                    if (!value) {
                        // Projects only
                        delete configurationsStore.preferences.dependencyPaths.vapoursynth;
                        return;
                    }

                    if (!configurationsStore.preferences.dependencyPaths.vapoursynth) {
                        configurationsStore.preferences.dependencyPaths.vapoursynth = { type: value };
                    }
                    configurationsStore.preferences.dependencyPaths.vapoursynth.type = value;
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            delete configurationsStore.preferences.dependencyPaths.vapoursynth;
        },
        isModified: () => {
            const previousVapoursynth = project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.vapoursynth : configStore.config.preferences.dependencyPaths.vapoursynth;

            if ((!previousVapoursynth || !previousVapoursynth.type)) {
                return (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.vapoursynth?.type !== undefined;
            } else if (previousVapoursynth?.type !== (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.vapoursynth?.type) {
                return true;
            } else {
                return false;
            }
        },
    };

    const dgdecnv: FormInputComponent = {
        label: 'DGDecNv',
        path: 'dgdecnv',
        component: h(
            NSelect,
            {
                value: configurationsStore.preferences.dependencyPaths.dgdecnv?.type === DependencyType.Custom ? configurationsStore.preferences.dependencyPaths.dgdecnv.path : configurationsStore.preferences.dependencyPaths.dgdecnv?.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: DependencyTypeToString(configStore.config.preferences.dependencyPaths.dgdecnv.type),
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (!value) {
                        // Projects only
                        delete configurationsStore.preferences.dependencyPaths.dgdecnv;
                        return;
                    }
                    let newValue: Project['preferences']['dependencyPaths']['dgdecnv'] = undefined;

                    if (value === DependencyType.Custom) {
                        // Get path from user
                        const environmentResources = await window.configurationsApi['get-environment-resources']();
                        const path = await window.configurationsApi['open-file'](environmentResources.PORTABLE.DGDECNV_PATH, 'DGDemux Path', undefined, ['openDirectory']);

                        if (!path || path.length < 1) {
                            // User canceled path selection
                            return;
                        }

                        newValue = {
                            type: value,
                            path: path[0],
                        };
                    } else {
                        newValue = {
                            type: value,
                        };
                    }

                    configurationsStore.preferences.dependencyPaths.dgdecnv = newValue;
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            if (project) {
                delete projectsStore.projects[projectIndex].preferences.dependencyPaths.dgdecnv;
            }
        },
        isModified: () => {
            const previousDgdecnv = project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.dgdecnv : configStore.config.preferences.dependencyPaths.dgdecnv;

            if ((!previousDgdecnv || !previousDgdecnv?.type) && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.dgdecnv?.type) {
                return true;
            } else if (previousDgdecnv?.type !== (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.dgdecnv?.type) {
                return true;
            } else if (previousDgdecnv?.type === DependencyType.Custom && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.dgdecnv?.type === DependencyType.Custom && previousDgdecnv.path !== ((configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.dgdecnv as { type: DependencyType.Custom, path: string; }).path) {
                return true;
            } else {
                return false;
            }
        },
    };

    const av1an: FormInputComponent = {
        label: 'Av1an',
        path: 'av1an',
        component: h(
            NSelect,
            {
                value: configurationsStore.preferences.dependencyPaths.av1an?.type === DependencyType.Custom ? configurationsStore.preferences.dependencyPaths.av1an.path : configurationsStore.preferences.dependencyPaths.av1an?.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: DependencyTypeToString(configStore.config.preferences.dependencyPaths.av1an.type),
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (!value) {
                        // Projects only
                        delete configurationsStore.preferences.dependencyPaths.av1an;
                        return;
                    }

                    let newValue: Project['preferences']['dependencyPaths']['av1an'] = undefined;

                    if (value === DependencyType.Custom) {
                        // Get path from user
                        const environmentResources = await window.configurationsApi['get-environment-resources']();
                        const path = await window.configurationsApi['open-file'](environmentResources.PORTABLE.AV1AN_PATH, 'Av1an Executable Path', [{ name: 'av1an', extensions: ['exe'] }], ['openFile']);

                        if (!path || path.length < 1) {
                            // User canceled path selection
                            return;
                        }

                        newValue = {
                            type: value,
                            path: path[0],
                        };
                    } else {
                        newValue = {
                            type: value,
                        };
                    }

                    configurationsStore.preferences.dependencyPaths.av1an = newValue;
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            delete configurationsStore.preferences.dependencyPaths.av1an;
        },
        isModified: () => {
            const previousAv1an = project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.av1an : configStore.config.preferences.dependencyPaths.av1an;

            if ((!previousAv1an || !previousAv1an?.type) && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.av1an?.type) {
                return true;
            } else if (previousAv1an?.type !== (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.av1an?.type) {
                return true;
            } else if (previousAv1an?.type === DependencyType.Custom && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.av1an?.type === DependencyType.Custom && previousAv1an.path !== ((configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.av1an as { type: DependencyType.Custom, path: string; }).path) {
                return true;
            } else {
                return false;
            }
        },
    };

    const ffmpeg: FormInputComponent = {
        label: 'FFmpeg',
        path: 'ffmpeg',
        component: h(
            NSelect,
            {
                value: configurationsStore.preferences.dependencyPaths.ffmpeg?.type === DependencyType.Custom ? configurationsStore.preferences.dependencyPaths.ffmpeg.path : configurationsStore.preferences.dependencyPaths.ffmpeg?.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: DependencyTypeToString(configStore.config.preferences.dependencyPaths.ffmpeg.type),
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (!value) {
                        // Projects only
                        delete configurationsStore.preferences.dependencyPaths.ffmpeg;
                        return;
                    }

                    let newValue: Project['preferences']['dependencyPaths']['ffmpeg'] = undefined;

                    if (value === DependencyType.Custom) {
                        // Get path from user
                        const environmentResources = await window.configurationsApi['get-environment-resources']();
                        const path = await window.configurationsApi['open-file'](environmentResources.PORTABLE.FFMPEG_PATH, 'FFmpeg Installation Directory', undefined, ['openDirectory']);

                        if (!path || path.length < 1) {
                            // User canceled path selection
                            return;
                        }

                        newValue = {
                            type: value,
                            path: path[0],
                        };
                    } else {
                        newValue = {
                            type: value,
                        };
                    }

                    configurationsStore.preferences.dependencyPaths.ffmpeg = newValue;
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            delete configurationsStore.preferences.dependencyPaths.ffmpeg;
        },
        isModified: () => {
            const previousFfmpeg = project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.ffmpeg : configStore.config.preferences.dependencyPaths.ffmpeg;

            if ((!previousFfmpeg || !previousFfmpeg?.type) && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.ffmpeg?.type) {
                return true;
            } else if (previousFfmpeg?.type !== (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.ffmpeg?.type) {
                return true;
            } else if (previousFfmpeg?.type === DependencyType.Custom && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.ffmpeg?.type === DependencyType.Custom && previousFfmpeg.path !== ((configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.ffmpeg as { type: DependencyType.Custom, path: string; }).path) {
                return true;
            } else {
                return false;
            }
        },
    };

    const mkvtoolnix: FormInputComponent = {
        label: 'MKVToolNix',
        path: 'mkvtoolnix',
        component: h(
            NSelect,
            {
                value: configurationsStore.preferences.dependencyPaths.mkvtoolnix?.type === DependencyType.Custom ? configurationsStore.preferences.dependencyPaths.mkvtoolnix.path : configurationsStore.preferences.dependencyPaths.mkvtoolnix?.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: DependencyTypeToString(configStore.config.preferences.dependencyPaths.mkvtoolnix.type),
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (!value) {
                        // Projects only
                        delete configurationsStore.preferences.dependencyPaths.mkvtoolnix;
                        return;
                    }

                    let newValue: Project['preferences']['dependencyPaths']['mkvtoolnix'] = undefined;

                    if (value === DependencyType.Custom) {
                        // Get path from user
                        const environmentResources = await window.configurationsApi['get-environment-resources']();
                        const path = await window.configurationsApi['open-file'](environmentResources.PORTABLE.MKVTOOLNIX_PATH, 'MKVToolNix Installation Directory', undefined, ['openDirectory']);

                        if (!path || path.length < 1) {
                            // User canceled path selection
                            return;
                        }

                        newValue = {
                            type: value,
                            path: path[0],
                        };
                    } else {
                        newValue = {
                            type: value,
                        };
                    }

                    configurationsStore.preferences.dependencyPaths.mkvtoolnix = newValue;
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            delete configurationsStore.preferences.dependencyPaths.mkvtoolnix;
        },
        isModified: () => {
            const previousMkvtoolnix = project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.mkvtoolnix : configStore.config.preferences.dependencyPaths.mkvtoolnix;

            if ((!previousMkvtoolnix || !previousMkvtoolnix?.type) && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.mkvtoolnix?.type) {
                return true;
            } else if (previousMkvtoolnix?.type !== (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.mkvtoolnix?.type) {
                return true;
            } else if (previousMkvtoolnix?.type === DependencyType.Custom && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.mkvtoolnix?.type === DependencyType.Custom && previousMkvtoolnix.path !== ((configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.mkvtoolnix as { type: DependencyType.Custom, path: string; }).path) {
                return true;
            } else {
                return false;
            }
        },
    };

    const aom: FormInputComponent = {
        label: 'AOM',
        path: 'aom',
        component: h(
            NSelect,
            {
                value: configurationsStore.preferences.dependencyPaths.aom?.type === DependencyType.Custom ? configurationsStore.preferences.dependencyPaths.aom.path : configurationsStore.preferences.dependencyPaths.aom?.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: DependencyTypeToString(configStore.config.preferences.dependencyPaths.aom.type),
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (!value) {
                        // Projects only
                        delete configurationsStore.preferences.dependencyPaths.aom;
                        return;
                    }

                    let newValue: Project['preferences']['dependencyPaths']['aom'] = undefined;

                    if (value === DependencyType.Custom) {
                        // Get path from user
                        const environmentResources = await window.configurationsApi['get-environment-resources']();
                        const path = await window.configurationsApi['open-file'](environmentResources.PORTABLE.AOM_PATH, 'AOM Executable Path', [{ name: 'aomenc', extensions: ['exe'] }]);

                        if (!path || path.length < 1) {
                            // User canceled path selection
                            return;
                        }

                        newValue = {
                            type: value,
                            path: path[0],
                        };
                    } else {
                        newValue = {
                            type: value,
                        };
                    }

                    configurationsStore.preferences.dependencyPaths.aom = newValue;
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            delete configurationsStore.preferences.dependencyPaths.aom;
        },
        isModified: () => {
            const previousAom = project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.aom : configStore.config.preferences.dependencyPaths.aom;

            if ((!previousAom || !previousAom?.type) && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.aom?.type) {
                return true;
            } else if (previousAom?.type !== (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.aom?.type) {
                return true;
            } else if (previousAom?.type === DependencyType.Custom && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.aom?.type === DependencyType.Custom && previousAom.path !== ((configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.aom as { type: DependencyType.Custom, path: string; }).path) {
                return true;
            } else {
                return false;
            }
        },
    };

    const svt: FormInputComponent = {
        label: 'SVT',
        path: 'svt',
        component: h(
            NSelect,
            {
                value: configurationsStore.preferences.dependencyPaths.svt?.type === DependencyType.Custom ? configurationsStore.preferences.dependencyPaths.svt.path : configurationsStore.preferences.dependencyPaths.svt?.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: DependencyTypeToString(configStore.config.preferences.dependencyPaths.svt.type),
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (!value) {
                        // Projects only
                        delete configurationsStore.preferences.dependencyPaths.svt;
                        return;
                    }

                    let newValue: Project['preferences']['dependencyPaths']['svt'] = undefined;

                    if (value === DependencyType.Custom) {
                        // Get path from user
                        const environmentResources = await window.configurationsApi['get-environment-resources']();
                        const path = await window.configurationsApi['open-file'](environmentResources.PORTABLE.SVT_PATH, 'SVT-AV1 Executable Path', [{ name: 'SvtAv1EncApp', extensions: ['exe'] }]);

                        if (!path || path.length < 1) {
                            // User canceled path selection
                            return;
                        }

                        newValue = {
                            type: value,
                            path: path[0],
                        };
                    } else {
                        newValue = {
                            type: value,
                        };
                    }

                    configurationsStore.preferences.dependencyPaths.svt = newValue;
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            delete configurationsStore.preferences.dependencyPaths.svt;
        },
        isModified: () => {
            const previousSvt = project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.svt : configStore.config.preferences.dependencyPaths.svt;

            if ((!previousSvt || !previousSvt?.type) && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.svt?.type) {
                return true;
            } else if (previousSvt?.type !== (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.svt?.type) {
                return true;
            } else if (previousSvt?.type === DependencyType.Custom && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.svt?.type === DependencyType.Custom && previousSvt.path !== ((configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.svt as { type: DependencyType.Custom, path: string; }).path) {
                return true;
            } else {
                return false;
            }
        },
    };

    const rav1e: FormInputComponent = {
        label: 'Rav1e',
        path: 'rav1e',
        component: h(
            NSelect,
            {
                value: configurationsStore.preferences.dependencyPaths.rav1e?.type === DependencyType.Custom ? configurationsStore.preferences.dependencyPaths.rav1e.path : configurationsStore.preferences.dependencyPaths.rav1e?.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: DependencyTypeToString(configStore.config.preferences.dependencyPaths.rav1e.type),
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (!value) {
                        // Projects only
                        delete configurationsStore.preferences.dependencyPaths.rav1e;
                        return;
                    }

                    let newValue: Project['preferences']['dependencyPaths']['rav1e'] = undefined;

                    if (value === DependencyType.Custom) {
                        // Get path from user
                        const environmentResources = await window.configurationsApi['get-environment-resources']();
                        const path = await window.configurationsApi['open-file'](environmentResources.PORTABLE.RAV1E_PATH, 'Rav1e Executable Path', [{ name: 'rav1e', extensions: ['exe'] }]);

                        if (!path || path.length < 1) {
                            // User canceled path selection
                            return;
                        }

                        newValue = {
                            type: value,
                            path: path[0],
                        };
                    } else {
                        newValue = {
                            type: value,
                        };
                    }

                    configurationsStore.preferences.dependencyPaths.rav1e = newValue;
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            delete configurationsStore.preferences.dependencyPaths.rav1e;
        },
        isModified: () => {
            const previousRav1e = project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.rav1e : configStore.config.preferences.dependencyPaths.rav1e;

            if ((!previousRav1e || !previousRav1e?.type) && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.rav1e?.type) {
                return true;
            } else if (previousRav1e?.type !== (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.rav1e?.type) {
                return true;
            } else if (previousRav1e?.type === DependencyType.Custom && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.rav1e?.type === DependencyType.Custom && previousRav1e.path !== ((configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.rav1e as { type: DependencyType.Custom, path: string; }).path) {
                return true;
            } else {
                return false;
            }
        },
    };

    const vpx: FormInputComponent = {
        label: 'VPX',
        path: 'vpx',
        component: h(
            NSelect,
            {
                value: configurationsStore.preferences.dependencyPaths.vpx?.type === DependencyType.Custom ? configurationsStore.preferences.dependencyPaths.vpx.path : configurationsStore.preferences.dependencyPaths.vpx?.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: DependencyTypeToString(configStore.config.preferences.dependencyPaths.vpx.type),
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (!value) {
                        // Projects only
                        delete configurationsStore.preferences.dependencyPaths.vpx;
                        return;
                    }

                    let newValue: Project['preferences']['dependencyPaths']['vpx'] = undefined;

                    if (value === DependencyType.Custom) {
                        // Get path from user
                        const environmentResources = await window.configurationsApi['get-environment-resources']();
                        const path = await window.configurationsApi['open-file'](environmentResources.PORTABLE.VPX_PATH, 'VPX Executable Path', [{ name: 'vpxenc', extensions: ['exe'] }]);

                        if (!path || path.length < 1) {
                            // User canceled path selection
                            return;
                        }

                        newValue = {
                            type: value,
                            path: path[0],
                        };
                    } else {
                        newValue = {
                            type: value,
                        };
                    }

                    configurationsStore.preferences.dependencyPaths.vpx = newValue;
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            delete configurationsStore.preferences.dependencyPaths.vpx;
        },
        isModified: () => {
            const previousVpx = project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.vpx : configStore.config.preferences.dependencyPaths.vpx;

            if ((!previousVpx || !previousVpx?.type) && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.vpx?.type) {
                return true;
            } else if (previousVpx?.type !== (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.vpx?.type) {
                return true;
            } else if (previousVpx?.type === DependencyType.Custom && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.vpx?.type === DependencyType.Custom && previousVpx.path !== ((configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.vpx as { type: DependencyType.Custom, path: string; }).path) {
                return true;
            } else {
                return false;
            }
        },
    };

    const x264: FormInputComponent = {
        label: 'x264',
        path: 'x264',
        component: h(
            NSelect,
            {
                value: configurationsStore.preferences.dependencyPaths.x264?.type === DependencyType.Custom ? configurationsStore.preferences.dependencyPaths.x264.path : configurationsStore.preferences.dependencyPaths.x264?.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: DependencyTypeToString(configStore.config.preferences.dependencyPaths.x264.type),
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (!value) {
                        // Projects only
                        delete configurationsStore.preferences.dependencyPaths.x264;
                        return;
                    }

                    let newValue: Project['preferences']['dependencyPaths']['x264'] = undefined;

                    if (value === DependencyType.Custom) {
                        // Get path from user
                        const environmentResources = await window.configurationsApi['get-environment-resources']();
                        const path = await window.configurationsApi['open-file'](environmentResources.PORTABLE.x264_PATH, 'x264 Executable Path', [{ name: 'x264', extensions: ['exe'] }]);

                        if (!path || path.length < 1) {
                            // User canceled path selection
                            return;
                        }

                        newValue = {
                            type: value,
                            path: path[0],
                        };
                    } else {
                        newValue = {
                            type: value,
                        };
                    }

                    configurationsStore.preferences.dependencyPaths.x264 = newValue;
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            delete configurationsStore.preferences.dependencyPaths.x264;
        },
        isModified: () => {
            const previousx264 = project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.x264 : configStore.config.preferences.dependencyPaths.x264;

            if ((!previousx264 || !previousx264?.type) && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.x264?.type) {
                return true;
            } else if (previousx264?.type !== (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.x264?.type) {
                return true;
            } else if (previousx264?.type === DependencyType.Custom && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.x264?.type === DependencyType.Custom && previousx264.path !== ((configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.x264 as { type: DependencyType.Custom, path: string; }).path) {
                return true;
            } else {
                return false;
            }
        },
    };

    const x265: FormInputComponent = {
        label: 'x265',
        path: 'x265',
        component: h(
            NSelect,
            {
                value: configurationsStore.preferences.dependencyPaths.x265?.type === DependencyType.Custom ? configurationsStore.preferences.dependencyPaths.x265.path : configurationsStore.preferences.dependencyPaths.x265?.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: DependencyTypeToString(configStore.config.preferences.dependencyPaths.x265.type),
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (!value) {
                        // Projects only
                        delete configurationsStore.preferences.dependencyPaths.x265;
                        return;
                    }

                    let newValue: Project['preferences']['dependencyPaths']['x265'] = undefined;

                    if (value === DependencyType.Custom) {
                        // Get path from user
                        const environmentResources = await window.configurationsApi['get-environment-resources']();
                        const path = await window.configurationsApi['open-file'](environmentResources.PORTABLE.x265_PATH, 'x265 Executable Path', [{ name: 'x265', extensions: ['exe'] }]);

                        if (!path || path.length < 1) {
                            // User canceled path selection
                            return;
                        }

                        newValue = {
                            type: value,
                            path: path[0],
                        };
                    } else {
                        newValue = {
                            type: value,
                        };
                    }

                    configurationsStore.preferences.dependencyPaths.x265 = newValue;
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            delete configurationsStore.preferences.dependencyPaths.x265;
        },
        isModified: () => {
            const previousx265 = project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.x265 : configStore.config.preferences.dependencyPaths.x265;

            if ((!previousx265 || !previousx265?.type) && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.x265?.type) {
                return true;
            } else if (previousx265?.type !== (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.x265?.type) {
                return true;
            } else if (previousx265?.type === DependencyType.Custom && (configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.x265?.type === DependencyType.Custom && previousx265.path !== ((configurationsStore.preferences as Preferences<ConfigurationType.Project>).dependencyPaths.x265 as { type: DependencyType.Custom, path: string; }).path) {
                return true;
            } else {
                return false;
            }
        },
    };

    return [
        vapoursynth,
        dgdecnv,
        av1an,
        ffmpeg,
        mkvtoolnix,
        aom,
        svt,
        rav1e,
        vpx,
        x264,
        x265,
    ];
}
