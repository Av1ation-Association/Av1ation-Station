import { lightTheme } from 'naive-ui';
import { defineStore } from 'pinia';
import { type Configuration } from '../../../main/src/data/Configuration/Types/Configuration';
// Temporary global store - to be refined later
export const useGlobalStore = defineStore(`global`, {
    state: () => {
        return {
            theme: lightTheme,
            // Settings

            // Configuration
            config: {} as Configuration,
        };
    },
    actions: {
        async getConfig() {
            const config = await window.configurationsApi['get-config']();
            this.config = config;
            return config;
        },
        async setConfig(config: Configuration, save = false) {
            this.config = config;
            await window.configurationsApi['set-config'](config);
            if (save) {
                await window.configurationsApi['save-config']();
            }
        },
        async saveConfig() {
            await window.configurationsApi['save-config']();
        },
    },
});
