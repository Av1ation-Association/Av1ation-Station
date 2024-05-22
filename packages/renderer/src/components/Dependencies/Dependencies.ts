import {
    h,
    toRaw,
} from 'vue';
import {
    NSelect,
} from 'naive-ui';
import { type FormInputComponent } from './library';
import { type Project } from '../../../../main/src/data/Configuration/Projects';
import { useGlobalStore } from '../../stores/global';
import { useProjectsStore } from '../../stores/projects';
import { DependencyType } from '../../../../main/src/data/Configuration/Types/Configuration';


export function getComponents(project?: Project): FormInputComponent[] {
    const configStore = useGlobalStore();
    const projectsStore = useProjectsStore();

    const projectIndex = project ? projectsStore.projects.findIndex(p => p.id === project.id) : -1;

    const vapoursynth: FormInputComponent = {
        label: 'VapourSynth',
        path: 'vapoursynth',
        component: h(
            NSelect,
            {
                value: project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.vapoursynth?.type : configStore.config.preferences.dependencyPaths.vapoursynth.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                ],
                placeholder: configStore.config.preferences.dependencyPaths.vapoursynth.type,
                onUpdateValue: (value?: DependencyType.System | DependencyType.Packaged) => {
                    if (value) {
                        if (project) {
                            if (!projectsStore.projects[projectIndex].preferences.dependencyPaths.vapoursynth) {
                                projectsStore.projects[projectIndex].preferences.dependencyPaths.vapoursynth = { type: value };
                            }

                            projectsStore.projects[projectIndex].preferences.dependencyPaths.vapoursynth!.type = value;
                        } else {
                            configStore.config.preferences.dependencyPaths.vapoursynth.type = value;
                        }
                    }
                },
            },
        ),
        reset: () => {
            if (project) {
                delete projectsStore.projects[projectIndex].preferences.dependencyPaths.vapoursynth;
            }
        },
    };

    const dgdecnv: FormInputComponent = {
        label: 'DGDecNv',
        path: 'dgdecnv',
        component: h(
            NSelect,
            {
                value: project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.dgdecnv?.type === DependencyType.Custom ? (projectsStore.projects[projectIndex].preferences.dependencyPaths.dgdecnv as { type: DependencyType.Custom, path: string; }).path : project.preferences.dependencyPaths.dgdecnv?.type : configStore.config.preferences.dependencyPaths.dgdecnv.type === DependencyType.Custom ? configStore.config.preferences.dependencyPaths.dgdecnv.path : configStore.config.preferences.dependencyPaths.dgdecnv.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: configStore.config.preferences.dependencyPaths.dgdecnv.type,
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (value) {
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

                        if (project) {
                            projectsStore.projects[projectIndex].preferences.dependencyPaths.dgdecnv = newValue;

                            // Update project
                            await projectsStore.saveProject(projectsStore.projects[projectIndex].id, true);
                        } else {
                            configStore.config.preferences.dependencyPaths.dgdecnv = newValue as typeof configStore.config.preferences.dependencyPaths.dgdecnv;

                            // Save config
                            configStore.setConfig(toRaw(configStore.config), true);
                        }
                    }
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            if (project) {
                delete projectsStore.projects[projectIndex].preferences.dependencyPaths.dgdecnv;
            }
        },
    };

    const av1an: FormInputComponent = {
        label: 'Av1an',
        path: 'av1an',
        component: h(
            NSelect,
            {
                value: project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.av1an?.type === DependencyType.Custom ? (projectsStore.projects[projectIndex].preferences.dependencyPaths.av1an as { type: DependencyType.Custom, path: string; }).path : project.preferences.dependencyPaths.av1an?.type : configStore.config.preferences.dependencyPaths.av1an.type === DependencyType.Custom ? configStore.config.preferences.dependencyPaths.av1an.path : configStore.config.preferences.dependencyPaths.av1an.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: configStore.config.preferences.dependencyPaths.av1an.type,
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (value) {
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

                        if (project) {
                            projectsStore.projects[projectIndex].preferences.dependencyPaths.av1an = newValue;

                            // Update project
                            await projectsStore.saveProject(projectsStore.projects[projectIndex].id, true);
                        } else {
                            configStore.config.preferences.dependencyPaths.av1an = newValue as typeof configStore.config.preferences.dependencyPaths.av1an;

                            // Save config
                            configStore.setConfig(toRaw(configStore.config), true);
                        }
                    }
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            if (project) {
                delete projectsStore.projects[projectIndex].preferences.dependencyPaths.av1an;
            }
        },
    };

    const ffmpeg: FormInputComponent = {
        label: 'FFmpeg',
        path: 'ffmpeg',
        component: h(
            NSelect,
            {
                value: project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.ffmpeg?.type === DependencyType.Custom ? (projectsStore.projects[projectIndex].preferences.dependencyPaths.ffmpeg as { type: DependencyType.Custom, path: string; }).path : project.preferences.dependencyPaths.ffmpeg?.type : configStore.config.preferences.dependencyPaths.ffmpeg.type === DependencyType.Custom ? configStore.config.preferences.dependencyPaths.ffmpeg.path : configStore.config.preferences.dependencyPaths.ffmpeg.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: configStore.config.preferences.dependencyPaths.ffmpeg.type,
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (value) {
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

                        if (project) {
                            projectsStore.projects[projectIndex].preferences.dependencyPaths.ffmpeg = newValue;

                            // Update project
                            await projectsStore.saveProject(projectsStore.projects[projectIndex].id, true);
                        } else {
                            configStore.config.preferences.dependencyPaths.ffmpeg = newValue as typeof configStore.config.preferences.dependencyPaths.ffmpeg;

                            // Save config
                            configStore.setConfig(toRaw(configStore.config), true);
                        }
                    }
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            if (project) {
                delete projectsStore.projects[projectIndex].preferences.dependencyPaths.ffmpeg;
            }
        },
    };

    const mkvtoolnix: FormInputComponent = {
        label: 'MKVToolNix',
        path: 'mkvtoolnix',
        component: h(
            NSelect,
            {
                value: project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.mkvtoolnix?.type === DependencyType.Custom ? (projectsStore.projects[projectIndex].preferences.dependencyPaths.mkvtoolnix as { type: DependencyType.Custom, path: string; }).path : project.preferences.dependencyPaths.mkvtoolnix?.type : configStore.config.preferences.dependencyPaths.mkvtoolnix.type === DependencyType.Custom ? configStore.config.preferences.dependencyPaths.mkvtoolnix.path : configStore.config.preferences.dependencyPaths.mkvtoolnix.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: configStore.config.preferences.dependencyPaths.mkvtoolnix.type,
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (value) {
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

                        if (project) {
                            projectsStore.projects[projectIndex].preferences.dependencyPaths.mkvtoolnix = newValue;

                            // Update project
                            await projectsStore.saveProject(projectsStore.projects[projectIndex].id, true);
                        } else {
                            configStore.config.preferences.dependencyPaths.mkvtoolnix = newValue as typeof configStore.config.preferences.dependencyPaths.mkvtoolnix;

                            // Save config
                            configStore.setConfig(toRaw(configStore.config), true);
                        }
                    }
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            if (project) {
                delete projectsStore.projects[projectIndex].preferences.dependencyPaths.mkvtoolnix;
            }
        },
    };

    const aom: FormInputComponent = {
        label: 'AOM',
        path: 'aom',
        component: h(
            NSelect,
            {
                value: project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.aom?.type === DependencyType.Custom ? (projectsStore.projects[projectIndex].preferences.dependencyPaths.aom as { type: DependencyType.Custom, path: string; }).path : project.preferences.dependencyPaths.aom?.type : configStore.config.preferences.dependencyPaths.aom.type === DependencyType.Custom ? configStore.config.preferences.dependencyPaths.aom.path : configStore.config.preferences.dependencyPaths.aom.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: configStore.config.preferences.dependencyPaths.aom.type,
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (value) {
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

                        if (project) {
                            projectsStore.projects[projectIndex].preferences.dependencyPaths.aom = newValue;

                            // Update project
                            await projectsStore.saveProject(projectsStore.projects[projectIndex].id, true);
                        } else {
                            configStore.config.preferences.dependencyPaths.aom = newValue as typeof configStore.config.preferences.dependencyPaths.aom;

                            // Save config
                            configStore.setConfig(toRaw(configStore.config), true);
                        }
                    }
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            if (project) {
                delete projectsStore.projects[projectIndex].preferences.dependencyPaths.aom;
            }
        },
    };

    const svt: FormInputComponent = {
        label: 'SVT',
        path: 'svt',
        component: h(
            NSelect,
            {
                value: project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.svt?.type === DependencyType.Custom ? (projectsStore.projects[projectIndex].preferences.dependencyPaths.svt as { type: DependencyType.Custom, path: string; }).path : project.preferences.dependencyPaths.svt?.type : configStore.config.preferences.dependencyPaths.svt.type === DependencyType.Custom ? configStore.config.preferences.dependencyPaths.svt.path : configStore.config.preferences.dependencyPaths.svt.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: configStore.config.preferences.dependencyPaths.svt.type,
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (value) {
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

                        if (project) {
                            projectsStore.projects[projectIndex].preferences.dependencyPaths.svt = newValue;

                            // Update project
                            await projectsStore.saveProject(projectsStore.projects[projectIndex].id, true);
                        } else {
                            configStore.config.preferences.dependencyPaths.svt = newValue as typeof configStore.config.preferences.dependencyPaths.svt;

                            // Save config
                            configStore.setConfig(toRaw(configStore.config), true);
                        }
                    }
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            if (project) {
                delete projectsStore.projects[projectIndex].preferences.dependencyPaths.svt;
            }
        },
    };

    const rav1e: FormInputComponent = {
        label: 'Rav1e',
        path: 'rav1e',
        component: h(
            NSelect,
            {
                value: project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.rav1e?.type === DependencyType.Custom ? (projectsStore.projects[projectIndex].preferences.dependencyPaths.rav1e as { type: DependencyType.Custom, path: string; }).path : project.preferences.dependencyPaths.rav1e?.type : configStore.config.preferences.dependencyPaths.rav1e.type === DependencyType.Custom ? configStore.config.preferences.dependencyPaths.rav1e.path : configStore.config.preferences.dependencyPaths.rav1e.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: configStore.config.preferences.dependencyPaths.rav1e.type,
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (value) {
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

                        if (project) {
                            projectsStore.projects[projectIndex].preferences.dependencyPaths.rav1e = newValue;

                            // Update project
                            await projectsStore.saveProject(projectsStore.projects[projectIndex].id, true);
                        } else {
                            configStore.config.preferences.dependencyPaths.rav1e = newValue as typeof configStore.config.preferences.dependencyPaths.rav1e;

                            // Save config
                            configStore.setConfig(toRaw(configStore.config), true);
                        }
                    }
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            if (project) {
                delete projectsStore.projects[projectIndex].preferences.dependencyPaths.rav1e;
            }
        },
    };

    const vpx: FormInputComponent = {
        label: 'VPX',
        path: 'vpx',
        component: h(
            NSelect,
            {
                value: project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.vpx?.type === DependencyType.Custom ? (projectsStore.projects[projectIndex].preferences.dependencyPaths.vpx as { type: DependencyType.Custom, path: string; }).path : project.preferences.dependencyPaths.vpx?.type : configStore.config.preferences.dependencyPaths.vpx.type === DependencyType.Custom ? configStore.config.preferences.dependencyPaths.vpx.path : configStore.config.preferences.dependencyPaths.vpx.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: configStore.config.preferences.dependencyPaths.vpx.type,
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (value) {
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

                        if (project) {
                            projectsStore.projects[projectIndex].preferences.dependencyPaths.vpx = newValue;

                            // Update project
                            await projectsStore.saveProject(projectsStore.projects[projectIndex].id, true);
                        } else {
                            configStore.config.preferences.dependencyPaths.vpx = newValue as typeof configStore.config.preferences.dependencyPaths.vpx;

                            // Save config
                            configStore.setConfig(toRaw(configStore.config), true);
                        }
                    }
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            if (project) {
                delete projectsStore.projects[projectIndex].preferences.dependencyPaths.vpx;
            }
        },
    };

    const x264: FormInputComponent = {
        label: 'x264',
        path: 'x264',
        component: h(
            NSelect,
            {
                value: project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.x264?.type === DependencyType.Custom ? (projectsStore.projects[projectIndex].preferences.dependencyPaths.x264 as { type: DependencyType.Custom, path: string; }).path : project.preferences.dependencyPaths.x264?.type : configStore.config.preferences.dependencyPaths.x264.type === DependencyType.Custom ? configStore.config.preferences.dependencyPaths.x264.path : configStore.config.preferences.dependencyPaths.x264.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: configStore.config.preferences.dependencyPaths.x264.type,
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (value) {
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

                        if (project) {
                            projectsStore.projects[projectIndex].preferences.dependencyPaths.x264 = newValue;

                            // Update project
                            await projectsStore.saveProject(projectsStore.projects[projectIndex].id, true);
                        } else {
                            configStore.config.preferences.dependencyPaths.x264 = newValue as typeof configStore.config.preferences.dependencyPaths.x264;

                            // Save config
                            configStore.setConfig(toRaw(configStore.config), true);
                        }
                    }
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            if (project) {
                delete projectsStore.projects[projectIndex].preferences.dependencyPaths.x264;
            }
        },
    };

    const x265: FormInputComponent = {
        label: 'x265',
        path: 'x265',
        component: h(
            NSelect,
            {
                value: project ? projectsStore.projects[projectIndex].preferences.dependencyPaths.x265?.type === DependencyType.Custom ? (projectsStore.projects[projectIndex].preferences.dependencyPaths.x265 as { type: DependencyType.Custom, path: string; }).path : project.preferences.dependencyPaths.x265?.type : configStore.config.preferences.dependencyPaths.x265.type === DependencyType.Custom ? configStore.config.preferences.dependencyPaths.x265.path : configStore.config.preferences.dependencyPaths.x265.type,
                options: [
                    { label: 'System', value: DependencyType.System },
                    { label: 'Packaged', value: DependencyType.Packaged },
                    { label: 'Custom', value: DependencyType.Custom },
                ],
                placeholder: configStore.config.preferences.dependencyPaths.x265.type,
                onUpdateValue: async (value?: DependencyType.System | DependencyType.Packaged | DependencyType.Custom) => {
                    if (value) {
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

                        if (project) {
                            projectsStore.projects[projectIndex].preferences.dependencyPaths.x265 = newValue;

                            // Update project
                            await projectsStore.saveProject(projectsStore.projects[projectIndex].id, true);
                        } else {
                            configStore.config.preferences.dependencyPaths.x265 = newValue as typeof configStore.config.preferences.dependencyPaths.x265;

                            // Save config
                            configStore.setConfig(toRaw(configStore.config), true);
                        }
                    }
                },
            },
        ),
        reset: () => {
            // Only allowed for Projects
            if (project) {
                delete projectsStore.projects[projectIndex].preferences.dependencyPaths.x265;
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