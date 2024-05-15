import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { defaultAv1anConfiguration } from './Av1anConfiguration';
import { type Configuration, StartUpBehavior, Theme } from './Types/Configuration';

const defaultConfig: Configuration = {
    // TODO: Add a versioning system
    appearance: {
        theme: Theme.Auto,
        size: {
            width: 800,
            height: 600,
        },
        position: {
            x: 0,
            y: 0,
        },
        maximized: false,
    },
    startUp: {
        behavior: StartUpBehavior.NewProject,
    },
    recentlyOpenedProjects: [],
    defaults: {
        Av1an: defaultAv1anConfiguration,
        Av1anCustom: {},
    },
    preferences: {
        defaults: {},
        showHidden: false,
        showAdvanced: false,
    },
};

export class ConfigurationManager {
    private static _instance: ConfigurationManager;
    private static config: Configuration;
    private static configPath = path.resolve(app.getPath('userData'), 'config.json');

    private constructor() {}

    public static get instance() {
        if (!this._instance) {
            this._instance = new ConfigurationManager();
        }

        return this._instance;
    }

    // TODO: Consider making these async methods
    public get configuration(): Configuration {
        if (!ConfigurationManager.config) {
            // Check if config file exists
            if (!fs.existsSync(ConfigurationManager.configPath)) {
                // Create config file
                ConfigurationManager.config = {
                    ...defaultConfig,
                };
            } else {
                // Read config file
                const existingConfig = JSON.parse(fs.readFileSync(ConfigurationManager.configPath, 'utf8')) as Configuration;
                ConfigurationManager.config = {
                    // Merge default config with file in case of missing properties
                    ...defaultConfig,
                    ...existingConfig,
                };
            }
        }

        return ConfigurationManager.config;
    }

    public set configuration(config: Configuration) {
        ConfigurationManager.config = config;
    }

    // Save the configuration to a file
    public static SaveConfiguration() {
        fs.writeFileSync(ConfigurationManager.configPath, JSON.stringify(ConfigurationManager.config, null, 4));
    }
}