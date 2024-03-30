import {
    type Ref,
    h,
} from 'vue';
import {
    NSelect,
} from 'naive-ui';
import { type PartialAv1anConfiguration } from '../Configuration/ConfigurationDefaults.vue';
import { type FormInputComponent } from './library';
import { Encoder } from '../../../../main/src/data/Av1an/Types/Options';

export function getComponents(formValueRef: Ref<PartialAv1anConfiguration>): FormInputComponent[] {
    const encoder = {
        label: 'Encoder',
        path: 'encoding.encoder',
        component: h(
            NSelect,
            {
                value: formValueRef.value.encoding?.encoder,
                clearable: true,
                options: [
                    { label: 'Alliance for Open Media AV1 (aom)', value: Encoder.aom },
                    { label: 'Scalable Video Technology (svt-av1)', value: Encoder.svt },
                    { label: 'Rust AV1 Encoder (rav1e)', value: Encoder.rav1e },
                    { label: 'Alliance for Open Media VP8/VP9 (vpx)', value: Encoder.vpx },
                    { label: 'Advanced Video Coding (x264)', value: Encoder.x264 },
                    { label: 'High Efficiency Video Coding (x265)', value: Encoder.x265 },
                ],
                onUpdateValue: (value?: Encoder) => {
                    if (!formValueRef.value.encoding) {
                        formValueRef.value.encoding = {};
                    }

                    if (value !== null) {
                        if (formValueRef.value.encoding.encoder !== value) {
                            // Reset value when changing encoder
                            formValueRef.value.encoding = {};
                        }

                        formValueRef.value.encoding.encoder = value;
                    }
                },
                placeholder: 'Alliance for Open Media AV1 (aom)',
                onClear: () => {
                    delete formValueRef.value.encoding?.encoder;
                },
            },
        ),
    };

    return [
        encoder,
    ];
}