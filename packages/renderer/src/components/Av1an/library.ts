import { type VNode } from 'vue';
import { getComponents as getAv1anGeneralComponents } from './Av1anGeneral';
import { getComponents as getAv1anScenesComponents } from './Av1anScenes';
import { getComponents as getAv1anChunkingComponents } from './Av1anChunking';
import { getComponents as getAv1anVMAFComponents } from './Av1anVMAF';
import { getComponents as getAv1anTargetQualityComponents } from './Av1anTargetQuality';
import { getComponents as getAv1anEncodingComponents } from './Av1anEncoding';

import { getComponents as getSVTGeneralComponents } from './SVT/SVTGeneral';
import { getComponents as getSVTGlobalComponents } from './SVT/SVTGlobal';
import { getComponents as getSVTGOPComponents } from './SVT/SVTGOP';
import { getComponents as getSVTRateControlComponents } from './SVT/SVTRateControl';
import { getComponents as getSVTAV1SpecificComponents } from './SVT/SVTAV1Specific';

// TODO: Convert to Generic Class
export interface FormInputComponent {
    label: string;
    path: string;
    advanced?: boolean;
    component: VNode;
    disable?: () => void;
    disabled?: () => boolean;
    reset: () => void;
}

export {
    getAv1anGeneralComponents,
    getAv1anScenesComponents,
    getAv1anChunkingComponents,
    getAv1anVMAFComponents,
    getAv1anTargetQualityComponents,
    getAv1anEncodingComponents,
    getSVTGeneralComponents,
    getSVTGlobalComponents,
    getSVTGOPComponents,
    getSVTRateControlComponents,
    getSVTAV1SpecificComponents,
};