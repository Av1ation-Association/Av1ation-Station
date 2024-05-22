import { type VNode } from 'vue';
import { getComponents as getDependenciesComponents } from './Dependencies';

// TODO: Convert to Generic Class
export interface FormInputComponent {
    label: string;
    path: string;
    component: VNode;
    reset: () => void;
}

export {
    getDependenciesComponents,
};