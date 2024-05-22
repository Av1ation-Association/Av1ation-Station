/// <reference types="vite/client" />

/**
 * Describes all existing environment variables and their types.
 * Required for Code completion/intellisense and type checking.
 *
 * Note: To prevent accidentally leaking env variables to the client, only variables prefixed with `VITE_` are exposed to your Vite-processed code.
 *
 * @see https://github.com/vitejs/vite/blob/0a699856b248116632c1ac18515c0a5c7cf3d1db/packages/vite/types/importMeta.d.ts#L7-L14 Base Interface.
 * @see https://vitejs.dev/guide/env-and-mode.html#env-files Vite Env Variables Doc.
 */
interface ImportMetaEnv {
    /**
     * URL where `renderer` web page is running.
     * This variable is initialized in scripts/watch.ts
     */
    readonly VITE_DEV_SERVER_URL: undefined | string;

    /** Current app version */
    readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
    
    resources: {
        /** Paths to portable binaries */
        PORTABLE: {
            /** Av1an executable path */
            AV1AN_PATH?: string;
        
            /** VapourSynth portable path */
            VAPOURSYNTH_PATH?: string;

            /** DGDecNV portable path */
            DGDECNV_PATH?: string;
        
            /** MKVToolNix portable path */
            MKVTOOLNIX_PATH?: string;
        
            /** FFmpeg portable path */
            FFMPEG_PATH?: string;
        
            /** SVT-AV1 executable path */
            SVT_PATH?: string;
        
            /** RAV1E executable path */
            RAV1E_PATH?: string;
        
            /** VPX executable path */
            VPX_PATH?: string;
        
            /** AOM executable path */
            AOM_PATH?: string;
        
            /** x264 executable path */
            x264_PATH?: string;
        
            /** x265 executable path */
            x265_PATH?: string;
        };
    }
}
