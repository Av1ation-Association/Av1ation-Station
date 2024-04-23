import {
    type Ref,
    h,
} from 'vue';
import {
    NSelect,
    NSlider,
} from 'naive-ui';
import { type PartialAv1anConfiguration } from '../../Configuration/ConfigurationDefaults.vue';
import { type SVTEncoding, Encoder } from '../../../../../main/src/data/Av1an/Types/Options';
import { type FormInputComponent } from '../library';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration>): FormInputComponent[] {
    const filmGrain = {
        label: 'Film Grain',
        path: `encoding['film-grain']`,
        component: h(
            NSlider,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['film-grain'],
                min: 0,
                max: 50,
                step: 1,
                // marks: {
                //     0: 'Disabled',
                // },
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding)['film-grain'] = value;
                    }
                },
            },
        ),
    };

    const filmGrainDenoise = {
        label: 'Film Grain Denoise',
        path: `encoding['film-grain-denoise']`,
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['film-grain-denoise'],
                clearable: true,
                options: [
                    { label: 'Disabled', value: 0 },
                    { label: 'Enabled', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding)['film-grain-denoise'] = value;
                    }
                },
                placeholder: 'Disabled',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['film-grain-denoise'];
                },
            },
        ),
    };

    const tileRows = {
        label: 'Tile Rows',
        path: `encoding['tile-rows']`,
        component: h(
            NSlider,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['tile-rows'],
                min: 0,
                max: 6,
                step: 1,
                // marks: {
                //     0: 'Default (Resolution-dependent)',
                // },
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding)['tile-rows'] = value;
                    }
                },
            },
        ),
    };

    const tileColumns = {
        label: 'Tile Columns',
        path: `encoding['tile-columns']`,
        component: h(
            NSlider,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['tile-columns'],
                min: 0,
                max: 4,
                step: 1,
                // marks: {
                //     0: 'Default (Resolution-dependent)',
                // },
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding)['tile-columns'] = value;
                    }
                },
            },
        ),
    };

    const enableDlf = {
        label: 'Deblocking Loop Filter',
        path: `encoding['enable-dlf']`,
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['enable-dlf'],
                clearable: true,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding)['enable-dlf'] = value;
                    }
                },
                placeholder: 'Enabled (1)',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-dlf'];
                },
            },
        ),
    };

    const enableCdef = {
        label: 'Constrained Directional Enhancement Filter',
        path: `encoding['enable-cdef']`,
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['enable-cdef'],
                clearable: true,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding)['enable-cdef'] = value;
                    }
                },
                placeholder: 'Enabled (1)',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-cdef'];
                },
            },
        ),
    };

    const enableRestoration = {
        label: 'Loop Restoration Filter',
        path: `encoding['enable-restoration']`,
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['enable-restoration'],
                clearable: true,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding)['enable-restoration'] = value;
                    }
                },
                placeholder: 'Enabled (1)',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-restoration'];
                },
            },
        ),
    };

    const enableTpl = {
        label: 'Temporal Dependency Model',
        path: `encoding['enable-tpl-la']`,
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['enable-tpl-la'],
                clearable: true,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding)['enable-tpl-la'] = value;
                    }
                },
                placeholder: 'Enabled (1)',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-tpl-la'];
                },
            },
        ),
    };

    const enableMfmv = {
        label: 'Motion Field Motion Vector',
        path: `encoding['enable-mfmv']`,
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['enable-mfmv'],
                clearable: true,
                options: [
                    { label: 'Auto (-1)', value: -1 },
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding)['enable-mfmv'] = value;
                    }
                },
                placeholder: 'Auto (-1)',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-mfmv'];
                },
            },
        ),
    };

    const enableTf = {
        label: 'ALT-REF (Temporally Filtered) Frames',
        path: `encoding['enable-tf']`,
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['enable-tf'],
                clearable: true,
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding)['enable-tf'] = value;
                    }
                },
                placeholder: 'Enabled (1)',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-tf'];
                },
            },
        ),
    };

    const enableOverlays = {
        label: 'Overlays',
        path: `encoding['enable-overlays']`,
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['enable-overlays'],
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding)['enable-overlays'] = value;
                    }
                },
                placeholder: 'Disabled (0)',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['enable-overlays'];
                },
            },
        ),
    };

    const enableScm = {
        label: 'Scren Content Detection Level (scm)',
        path: `encoding['scm']`,
        component: h(
            NSelect,
            {
                value: (formValueRef.value.encoding as SVTEncoding)['scm'],
                options: [
                    { label: 'Disabled (0)', value: 0 },
                    { label: 'Enabled (1)', value: 1 },
                ],
                onUpdateValue: (value) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {
                            encoder: Encoder.svt,
                        };
                    }

                    if (value !== null) {
                        (formValueRef.value.encoding as SVTEncoding)['scm'] = value;
                    }
                },
                placeholder: 'Disabled (0)',
                onClear: () => {
                    delete (formValueRef.value.encoding as SVTEncoding)['scm'];
                },
            },
        ),
    };

    return [
        filmGrain,
        filmGrainDenoise,
        tileRows,
        tileColumns,
        enableDlf,
        enableCdef,
        enableRestoration,
        enableTpl,
        enableMfmv,
        enableTf,
        enableOverlays,
        enableScm,
    ];
}