import {
    type Ref,
    h,
} from 'vue';
import {
    NSelect,
} from 'naive-ui';
import {
    type PartialChildren,
    type PartialAv1anConfiguration,
} from '../Configuration/ConfigurationDefaults.vue';
import {
    ChunkMethod,
    ChunkOrder,
    Concatenator,
} from '../../../../main/src/data/Av1an/Types/Options';
import { type FormInputComponent } from './library';
import { type Task } from '../../../../main/src/data/Configuration/Projects';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration | PartialChildren<Task['item']['Av1an']>>, parentAv1anValue?: PartialAv1anConfiguration): FormInputComponent[] {
    const chunkingMethod = {
        label: 'Chunking Method',
        path: 'chunking.method',
        component: h(
            NSelect,
            {
                value: formValueRef.value.chunking?.method,
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
                placeholder: 'L-SmashWorks',
                defaultValue: parentAv1anValue?.chunking?.method,
                onUpdateValue: (value?: ChunkMethod) => {
                    if (!formValueRef.value.chunking) {
                        formValueRef.value.chunking = {};
                    }
                    if (value !== null) {
                        if (parentAv1anValue?.chunking?.method === value) {
                            delete formValueRef.value.chunking.method;
                        } else {
                            formValueRef.value.chunking.method = value;
                        }
                    }
                },
                onClear: () => {
                    delete formValueRef.value.chunking?.method;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.chunking) {
                formValueRef.value.chunking = {};
            }

            formValueRef.value.chunking.method = null;
        },
        disabled: () => {
            return formValueRef.value.chunking?.method === null;
        },
        reset: () => {
            delete formValueRef.value.chunking?.method;
        },
    };

    const chunkOrder = {
        label: 'Chunk Order',
        path: 'chunking.order',
        component: h(
            NSelect,
            {
                value: formValueRef.value.chunking?.order,
                clearable: true,
                options: [
                    { label: 'Long to Short', value: ChunkOrder.longToShort },
                    { label: 'Short to Long', value: ChunkOrder.shortToLong },
                    { label: 'Sequential', value: ChunkOrder.sequential },
                    { label: 'Random', value: ChunkOrder.random },
                ],
                placeholder: 'Long to Short',
                defaultValue: parentAv1anValue?.chunking?.order,
                onUpdateValue: (value?: ChunkOrder) => {
                    if (!formValueRef.value.chunking) {
                        formValueRef.value.chunking = {};
                    }
                    if (value !== null) {
                        if (parentAv1anValue?.chunking?.order === value) {
                            delete formValueRef.value.chunking.order;
                        } else {
                            formValueRef.value.chunking.order = value;
                        }
                    }
                },
                onClear: () => {
                    delete formValueRef.value.chunking?.order;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.chunking) {
                formValueRef.value.chunking = {};
            }

            formValueRef.value.chunking.order = null;
        },
        disabled: () => {
            return formValueRef.value.chunking?.order === null;
        },
        reset: () => {
            delete formValueRef.value.chunking?.order;
        },
    };

    const concatenater = {
        label: 'Chunk Concatenation Method',
        path: 'chunking.concatenater',
        component: h(
            NSelect,
            {
                value: formValueRef.value.chunking?.concatenater,
                clearable: true,
                options: [
                    { label: 'FFmpeg', value: Concatenator.ffmpeg },
                    { label: 'MKVMerge', value: Concatenator.mkvmerge },
                    { label: 'IVF', value: Concatenator.ivf },
                ],
                placeholder: 'FFmpeg',
                defaultValue: parentAv1anValue?.chunking?.concatenater,
                onUpdateValue: (value?: Concatenator) => {
                    if (!formValueRef.value.chunking) {
                        formValueRef.value.chunking = {};
                    }
                    if (value !== null) {
                        if (parentAv1anValue?.chunking?.concatenater === value) {
                            delete formValueRef.value.chunking.concatenater;
                        } else {
                            formValueRef.value.chunking.concatenater = value;
                        }
                    }
                },
                onClear: () => {
                    delete formValueRef.value.chunking?.concatenater;
                },
            },
        ),
        disable: () => {
            if (!formValueRef.value.chunking) {
                formValueRef.value.chunking = {};
            }

            formValueRef.value.chunking.concatenater = null;
        },
        disabled: () => {
            return formValueRef.value.chunking?.concatenater === null;
        },
        reset: () => {
            delete formValueRef.value.chunking?.concatenater;
        },
    };

    return [
        chunkingMethod,
        chunkOrder,
        concatenater,
    ];
}