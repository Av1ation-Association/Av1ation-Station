import { type VNode } from 'vue';
import { getComponents as getDependenciesComponents } from './Dependencies';
import { getComponents as getFileLocationsComponents } from './FileLocations';

// TODO: Convert to Generic Class
export interface FormInputComponent {
    label: string;
    path: string;
    component: VNode;
    reset: () => void;
    isModified: () => boolean;
}

export {
    getDependenciesComponents,
    getFileLocationsComponents,
};
