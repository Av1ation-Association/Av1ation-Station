import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { defaultAv1anConfiguration } from '../../../../shared/src/data/Av1anConfiguration.js';
import {
    type Configuration,
    StartUpBehavior,
    Theme,
    DependencyType,
    VSHIPBackend,
} from '../../../../shared/src/data/Configuration.js';

const isWindows = os.platform() === 'win32';

// TODO: Check which packages are pre-installed

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
        enableHardwareAcceleration: true,
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
        dependencyPaths: {
            // TODO: Default to Package if windows and packaged items exist
            vapoursynth: { type: isWindows ? DependencyType.Packaged : DependencyType.System },
            dgdecnv: { type: isWindows ? DependencyType.Packaged : DependencyType.System },
            av1an: { type: isWindows ? DependencyType.Packaged : DependencyType.System },
            ffmpeg: { type: isWindows ? DependencyType.Packaged : DependencyType.System },
            mkvtoolnix: { type: isWindows ? DependencyType.Packaged : DependencyType.System },
            aom: { type: isWindows ? DependencyType.Packaged : DependencyType.System },
            svt: { type: isWindows ? DependencyType.Packaged : DependencyType.System },
            rav1e: { type: isWindows ? DependencyType.Packaged : DependencyType.System },
            vpx: { type: isWindows ? DependencyType.Packaged : DependencyType.System },
            x264: { type: isWindows ? DependencyType.Packaged : DependencyType.System },
            x265: { type: isWindows ? DependencyType.Packaged : DependencyType.System },
        },
        notifications: {
            os: false,
            app: true,
        },
        vship: VSHIPBackend.Disabled,
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

    public static MergeDefault(existingConfig: Configuration): Configuration {
        const { appearance, startUp, defaults, preferences, ...configRest } = existingConfig;
        const { appearance: defaultAppearance, startUp: defaultStartUp, defaults: defaultDefaults, preferences: defaultPreferences, ...defaultRest } = defaultConfig;

        // Merge appearance
        const { theme, size, position, maximized, enableHardwareAcceleration } = appearance;
        const { theme: defaultTheme, size: defaultSize, position: defaultPosition, maximized: defaultMaximized, enableHardwareAcceleration: defaultEnableHardwareAcceleration } = defaultAppearance;
        const mergedAppearance: Configuration['appearance'] = {
            theme: theme ?? defaultTheme,
            size: {
                ...defaultSize,
                ...size,
            },
            position: {
                ...defaultPosition,
                ...position,
            },
            maximized: maximized ?? defaultMaximized,
            enableHardwareAcceleration: enableHardwareAcceleration ?? defaultEnableHardwareAcceleration,
        };

        // Merge startUp
        const { behavior } = startUp;
        const { behavior: defaultBehavior } = defaultStartUp;
        const mergedStartUp: Configuration['startUp'] = {
            behavior: behavior ?? defaultBehavior,
        };

        // Merge defaults
        const mergedDefaults: Configuration['defaults'] = {
            ...defaultDefaults,
            ...defaults,
        };

        // Merge preferences
        const { defaults: preferencesDefaults, showHidden, showAdvanced, dependencyPaths, notifications, vship } = preferences;
        const { defaults: defaultPreferencesDefaults, showHidden: defaultShowHidden, showAdvanced: defaultShowAdvanced, dependencyPaths: defaultDependencyPaths, notifications: defaultNotifications, vship: defaultVship } = defaultPreferences;

        const mergedPreferences: Configuration['preferences'] = {
            defaults: preferencesDefaults ?? defaultPreferencesDefaults,
            showHidden: showHidden ?? defaultShowHidden,
            showAdvanced: showAdvanced ?? defaultShowAdvanced,
            dependencyPaths: {
                ...defaultDependencyPaths,
                ...dependencyPaths,
            },
            notifications: {
                ...defaultNotifications,
                ...notifications,
            },
            vship: vship ?? defaultVship,
        };

        return {
            appearance: mergedAppearance,
            startUp: mergedStartUp,
            defaults: mergedDefaults,
            preferences: mergedPreferences,
            ...defaultRest,
            ...configRest,
        };
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

                // Merge default config with file in case of missing properties
                return ConfigurationManager.MergeDefault(existingConfig);
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

    public static ResetConfiguration() {
        fs.writeFileSync(ConfigurationManager.configPath, JSON.stringify(defaultConfig, null, 4));
        ConfigurationManager.config = defaultConfig;
    }
}