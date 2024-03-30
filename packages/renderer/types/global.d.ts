import type { api as configurationsAPI } from '../../main/src/api/Configuration/client';
import type { api as projectsAPI } from '../../main/src/api/Projects/client';

declare global {
    interface Window {
        configurationsApi: typeof configurationsAPI;
        projectsApi: typeof projectsAPI;
    }
}
