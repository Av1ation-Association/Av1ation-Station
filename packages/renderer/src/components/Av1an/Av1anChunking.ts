import { h } from 'vue';
import {
    NSelect,
} from 'naive-ui';
import {
    ChunkMethod,
    ChunkMethodtoString,
    ChunkOrder,
    ChunkOrdertoString,
    Concatenator,
    ConcatenatortoString,
} from '../../../../shared/src/data/Types/Options';
import { type ConfigurationType } from '../../../../shared/src/data/Configuration';
import { useConfigurationsStore } from '../../stores/configurations';
import { type FormInputComponent } from './library';

export function getComponents(): FormInputComponent[] {
    const configurationsStore = useConfigurationsStore<ConfigurationType.Task>();
    const parentAv1an = configurationsStore.parentAv1an;
    const previousAv1an = configurationsStore.previousDefaults.Av1an;

    const chunkingMethod = {
        label: 'Chunking Method',
        path: 'chunking.method',
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.chunking?.method,
                clearable: true,
                options: [
                    { label: 'Segment', value: ChunkMethod.segment },
                    { label: 'Select', value: ChunkMethod.select },
                    { label: 'FFMS2', value: ChunkMethod.ffms2 },
                    { label: 'L-SmashWorks', value: ChunkMethod.lsmash },
                    { label: 'Hybrid', value: ChunkMethod.hybrid },
                    { label: 'DGDecNV', value: ChunkMethod.dgdecnv },
                    { label: 'BestSource', value: ChunkMethod.bestsource },
                ],
                placeholder: ChunkMethodtoString(parentAv1an.chunking?.method ?? ChunkMethod.lsmash),
                // defaultValue: parentAv1an.chunking?.method,
                onUpdateValue: (value?: ChunkMethod) => {
                    if (!configurationsStore.defaults.Av1an.chunking) {
                        configurationsStore.defaults.Av1an.chunking = {};
                    }
                    if (value !== null) {
                        if (parentAv1an.chunking?.method === value) {
                            delete configurationsStore.defaults.Av1an.chunking.method;
                        } else {
                            configurationsStore.defaults.Av1an.chunking.method = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.chunking?.method;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.chunking) {
                configurationsStore.defaults.Av1an.chunking = {};
            }

            configurationsStore.defaults.Av1an.chunking.method = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.chunking?.method === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.chunking?.method;
        },
        isModified: () => {
            if (!previousAv1an.chunking || previousAv1an.chunking.method === undefined) {
                return configurationsStore.defaults.Av1an.chunking?.method !== undefined;
            } else if (previousAv1an.chunking.method !== configurationsStore.defaults.Av1an.chunking?.method) {
                return true;
            } else {
                return false;
            }
        },
    };

    const chunkOrder = {
        label: 'Chunk Order',
        path: 'chunking.order',
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.chunking?.order,
                clearable: true,
                options: [
                    { label: 'Long to Short', value: ChunkOrder.longToShort },
                    { label: 'Short to Long', value: ChunkOrder.shortToLong },
                    { label: 'Sequential', value: ChunkOrder.sequential },
                    { label: 'Random', value: ChunkOrder.random },
                ],
                placeholder: ChunkOrdertoString(parentAv1an.chunking?.order ?? ChunkOrder.longToShort),
                // defaultValue: parentAv1an.chunking?.order,
                onUpdateValue: (value?: ChunkOrder) => {
                    if (!configurationsStore.defaults.Av1an.chunking) {
                        configurationsStore.defaults.Av1an.chunking = {};
                    }
                    if (value !== null) {
                        if (parentAv1an.chunking?.order === value) {
                            delete configurationsStore.defaults.Av1an.chunking.order;
                        } else {
                            configurationsStore.defaults.Av1an.chunking.order = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.chunking?.order;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.chunking) {
                configurationsStore.defaults.Av1an.chunking = {};
            }

            configurationsStore.defaults.Av1an.chunking.order = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.chunking?.order === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.chunking?.order;
        },
        isModified: () => {
            if (!previousAv1an.chunking || previousAv1an.chunking.order === undefined) {
                return configurationsStore.defaults.Av1an.chunking?.order !== undefined;
            } else if (previousAv1an.chunking.order !== configurationsStore.defaults.Av1an.chunking?.order) {
                return true;
            } else {
                return false;
            }
        },
    };

    const concatenater = {
        label: 'Chunk Concatenation Method',
        path: 'chunking.concatenater',
        component: h(
            NSelect,
            {
                value: configurationsStore.defaults.Av1an.chunking?.concatenater,
                clearable: true,
                options: [
                    { label: 'FFmpeg', value: Concatenator.ffmpeg },
                    { label: 'MKVMerge', value: Concatenator.mkvmerge },
                    { label: 'IVF', value: Concatenator.ivf },
                ],
                placeholder: ConcatenatortoString(parentAv1an.chunking?.concatenater ?? Concatenator.ffmpeg),
                // defaultValue: parentAv1an.chunking?.concatenater,
                onUpdateValue: (value?: Concatenator) => {
                    if (!configurationsStore.defaults.Av1an.chunking) {
                        configurationsStore.defaults.Av1an.chunking = {};
                    }
                    if (value !== null) {
                        if (parentAv1an.chunking?.concatenater === value) {
                            delete configurationsStore.defaults.Av1an.chunking.concatenater;
                        } else {
                            configurationsStore.defaults.Av1an.chunking.concatenater = value;
                        }
                    }
                },
                onClear: () => {
                    delete configurationsStore.defaults.Av1an.chunking?.concatenater;
                },
            },
        ),
        disable: () => {
            if (!configurationsStore.defaults.Av1an.chunking) {
                configurationsStore.defaults.Av1an.chunking = {};
            }

            configurationsStore.defaults.Av1an.chunking.concatenater = null;
        },
        disabled: () => {
            return configurationsStore.defaults.Av1an.chunking?.concatenater === null;
        },
        reset: () => {
            delete configurationsStore.defaults.Av1an.chunking?.concatenater;
        },
        isModified: () => {
            if (!previousAv1an.chunking || previousAv1an.chunking.concatenater === undefined) {
                return configurationsStore.defaults.Av1an.chunking?.concatenater !== undefined;
            } else if (previousAv1an.chunking.concatenater !== configurationsStore.defaults.Av1an.chunking?.concatenater) {
                return true;
            } else {
                return false;
            }
        },
    };

    return [
        chunkingMethod,
        chunkOrder,
        concatenater,
    ];
}
