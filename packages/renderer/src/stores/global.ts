import {
    useOsTheme,
    lightTheme,
    darkTheme,
} from 'naive-ui';
import { defineStore } from 'pinia';
import { Theme, type Configuration } from '../../../shared/src/data/Configuration';

export const useGlobalStore = defineStore(`global`, {
    state: () => {
        return {
            theme: useOsTheme().value === 'dark' ? darkTheme : lightTheme,
            // Settings

            // Configuration
            config: {} as Configuration,
        };
    },
    actions: {
        async getConfig() {
            if (Object.keys(this.config).length) {
                return this.config;
            }

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
        async resetConfig() {
            // Reset the config to default
            await window.configurationsApi['reset-config']();
            await this.getConfig();
        },
        async initialize() {
            // Set Theme
            this.updateTheme();

            // Initialize Environment
            await window.configurationsApi['init-environment']();
        },
        updateTheme(theme?: Theme) {
            if (theme) {
                this.config.appearance.theme = theme;
            }

            switch (this.config.appearance.theme) {
                default:
                case Theme.Auto:
                    this.theme = useOsTheme().value === 'dark' ? darkTheme : lightTheme;
                    break;
                case Theme.Light:
                    this.theme = lightTheme;
                    break;
                case Theme.Dark:
                    this.theme = darkTheme;
                    break;
            }
        },
    },
});
