// packages/preload/vite.config.js
import { resolveModuleExportNames } from "file:///C:/Users/ichig/Documents/Projects/Av1ation%20Station%202/node_modules/mlly/dist/index.mjs";
import { getChromeMajorVersion } from "file:///C:/Users/ichig/Documents/Projects/Av1ation%20Station%202/packages/electron-versions/index.js";
var __vite_injected_original_import_meta_url = "file:///C:/Users/ichig/Documents/Projects/Av1ation%20Station%202/packages/preload/vite.config.js";
var vite_config_default = (
  /**
  * @type {import('vite').UserConfig}
  * @see https://vitejs.dev/config/
  */
  {
    build: {
      ssr: true,
      sourcemap: "inline",
      outDir: "dist",
      target: `chrome${getChromeMajorVersion()}`,
      assetsDir: ".",
      lib: {
        entry: ["src/exposed.ts", "virtual:browser.js"]
      },
      rollupOptions: {
        output: [
          {
            // ESM preload scripts must have the .mjs extension
            // https://www.electronjs.org/docs/latest/tutorial/esm#esm-preload-scripts-must-have-the-mjs-extension
            entryFileNames: "[name].mjs"
          }
        ]
      },
      emptyOutDir: true,
      reportCompressedSize: false
    },
    plugins: [mockExposed(), handleHotReload()]
  }
);
function mockExposed() {
  const virtualModuleId = "virtual:browser.js";
  const resolvedVirtualModuleId = "\0" + virtualModuleId;
  return {
    name: "electron-main-exposer",
    resolveId(id) {
      if (id.endsWith(virtualModuleId)) {
        return resolvedVirtualModuleId;
      }
    },
    async load(id) {
      if (id === resolvedVirtualModuleId) {
        const exportedNames = await resolveModuleExportNames("./src/index.ts", {
          url: __vite_injected_original_import_meta_url
        });
        return exportedNames.reduce((s, key) => {
          return s + (key === "default" ? `export default globalThis['${btoa(key)}'];
` : `export const ${key} = globalThis['${btoa(key)}'];
`);
        }, "");
      }
    }
  };
}
function handleHotReload() {
  let rendererWatchServer = null;
  return {
    name: "@vite-electron-builder/preload-process-hot-reload",
    config(config, env) {
      if (env.mode !== "development") {
        return;
      }
      const rendererWatchServerProvider = config.plugins.find((p) => p.name === "@vite-electron-builder/renderer-watch-server-provider");
      if (!rendererWatchServerProvider) {
        throw new Error("Renderer watch server provider not found");
      }
      rendererWatchServer = rendererWatchServerProvider.api.provideRendererWatchServer();
      return {
        build: {
          watch: {}
        }
      };
    },
    writeBundle() {
      if (!rendererWatchServer) {
        return;
      }
      rendererWatchServer.ws.send({
        type: "full-reload"
      });
    }
  };
}
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsicGFja2FnZXMvcHJlbG9hZC92aXRlLmNvbmZpZy5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXGljaGlnXFxcXERvY3VtZW50c1xcXFxQcm9qZWN0c1xcXFxBdjFhdGlvbiBTdGF0aW9uIDJcXFxccGFja2FnZXNcXFxccHJlbG9hZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcaWNoaWdcXFxcRG9jdW1lbnRzXFxcXFByb2plY3RzXFxcXEF2MWF0aW9uIFN0YXRpb24gMlxcXFxwYWNrYWdlc1xcXFxwcmVsb2FkXFxcXHZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9pY2hpZy9Eb2N1bWVudHMvUHJvamVjdHMvQXYxYXRpb24lMjBTdGF0aW9uJTIwMi9wYWNrYWdlcy9wcmVsb2FkL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgcmVzb2x2ZU1vZHVsZUV4cG9ydE5hbWVzIH0gZnJvbSAnbWxseSc7XG5pbXBvcnQgeyBnZXRDaHJvbWVNYWpvclZlcnNpb24gfSBmcm9tICdAdml0ZS1lbGVjdHJvbi1idWlsZGVyL2VsZWN0cm9uLXZlcnNpb25zJztcblxuZXhwb3J0IGRlZmF1bHQgLyoqXG4gKiBAdHlwZSB7aW1wb3J0KCd2aXRlJykuVXNlckNvbmZpZ31cbiAqIEBzZWUgaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cbiAqL1xuKHtcbiAgICBidWlsZDoge1xuICAgICAgICBzc3I6IHRydWUsXG4gICAgICAgIHNvdXJjZW1hcDogJ2lubGluZScsXG4gICAgICAgIG91dERpcjogJ2Rpc3QnLFxuICAgICAgICB0YXJnZXQ6IGBjaHJvbWUke2dldENocm9tZU1ham9yVmVyc2lvbigpfWAsXG4gICAgICAgIGFzc2V0c0RpcjogJy4nLFxuICAgICAgICBsaWI6IHtcbiAgICAgICAgICAgIGVudHJ5OiBbJ3NyYy9leHBvc2VkLnRzJywgJ3ZpcnR1YWw6YnJvd3Nlci5qcyddLFxuICAgICAgICB9LFxuICAgICAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICAgICAgICBvdXRwdXQ6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEVTTSBwcmVsb2FkIHNjcmlwdHMgbXVzdCBoYXZlIHRoZSAubWpzIGV4dGVuc2lvblxuICAgICAgICAgICAgICAgICAgICAvLyBodHRwczovL3d3dy5lbGVjdHJvbmpzLm9yZy9kb2NzL2xhdGVzdC90dXRvcmlhbC9lc20jZXNtLXByZWxvYWQtc2NyaXB0cy1tdXN0LWhhdmUtdGhlLW1qcy1leHRlbnNpb25cbiAgICAgICAgICAgICAgICAgICAgZW50cnlGaWxlTmFtZXM6ICdbbmFtZV0ubWpzJyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgICAgZW1wdHlPdXREaXI6IHRydWUsXG4gICAgICAgIHJlcG9ydENvbXByZXNzZWRTaXplOiBmYWxzZSxcbiAgICB9LFxuICAgIHBsdWdpbnM6IFttb2NrRXhwb3NlZCgpLCBoYW5kbGVIb3RSZWxvYWQoKV0sXG59KTtcblxuXG4vKipcbiAqIFRoaXMgcGx1Z2luIGNyZWF0ZXMgYSBicm93c2VyIChyZW5kZXJlcikgdmVyc2lvbiBvZiBgcHJlbG9hZGAgcGFja2FnZS5cbiAqIEJhc2ljYWxseSwgaXQganVzdCByZWFkIGFsbCBub21pbmFscyB5b3UgZXhwb3J0ZWQgZnJvbSBwYWNrYWdlIGFuZCBkZWZpbmUgaXQgYXMgZ2xvYmFsVGhpcyBwcm9wZXJ0aWVzXG4gKiBleHBlY3RpbmcgdGhhdCByZWFsIHZhbHVlcyB3ZXJlIGV4cG9zZWQgYnkgYGVsZWN0cm9uLmNvbnRleHRCcmlkZ2UuZXhwb3NlSW5NYWluV29ybGQoKWBcbiAqXG4gKiBFeGFtcGxlOlxuICogYGBgdHNcbiAqIC8vIGluZGV4LnRzXG4gKiBleHBvcnQgY29uc3Qgc29tZVZhciA9ICdteS12YWx1ZSc7XG4gKiBgYGBcbiAqXG4gKiBPdXRwdXRcbiAqIGBgYGpzXG4gKiAvLyBfdmlydHVhbF9icm93c2VyLm1qc1xuICogZXhwb3J0IGNvbnN0IHNvbWVWYXIgPSBnbG9iYWxUaGlzWzxoYXNoPl0gLy8gJ215LXZhbHVlJ1xuICogYGBgXG4gKi9cbmZ1bmN0aW9uIG1vY2tFeHBvc2VkKCkge1xuICAgIGNvbnN0IHZpcnR1YWxNb2R1bGVJZCA9ICd2aXJ0dWFsOmJyb3dzZXIuanMnO1xuICAgIGNvbnN0IHJlc29sdmVkVmlydHVhbE1vZHVsZUlkID0gJ1xcMCcgKyB2aXJ0dWFsTW9kdWxlSWQ7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBuYW1lOiAnZWxlY3Ryb24tbWFpbi1leHBvc2VyJyxcbiAgICAgICAgcmVzb2x2ZUlkKGlkKSB7XG4gICAgICAgICAgICBpZiAoaWQuZW5kc1dpdGgodmlydHVhbE1vZHVsZUlkKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlZFZpcnR1YWxNb2R1bGVJZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgYXN5bmMgbG9hZChpZCkge1xuICAgICAgICAgICAgaWYgKGlkID09PSByZXNvbHZlZFZpcnR1YWxNb2R1bGVJZCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGV4cG9ydGVkTmFtZXMgPSBhd2FpdCByZXNvbHZlTW9kdWxlRXhwb3J0TmFtZXMoJy4vc3JjL2luZGV4LnRzJywge1xuICAgICAgICAgICAgICAgICAgICB1cmw6IGltcG9ydC5tZXRhLnVybCxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZXhwb3J0ZWROYW1lcy5yZWR1Y2UoKHMsIGtleSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICAgICAgICAgICAgcyArXG4gICAgICAgICAgICAoa2V5ID09PSAnZGVmYXVsdCdcbiAgICAgICAgICAgICAgICA/IGBleHBvcnQgZGVmYXVsdCBnbG9iYWxUaGlzWycke2J0b2Eoa2V5KX0nXTtcXG5gXG4gICAgICAgICAgICAgICAgOiBgZXhwb3J0IGNvbnN0ICR7a2V5fSA9IGdsb2JhbFRoaXNbJyR7YnRvYShrZXkpfSddO1xcbmApXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfSwgJycpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgIH07XG59XG5cblxuLyoqXG4gKiBJbXBsZW1lbnQgRWxlY3Ryb24gd2VidmlldyByZWxvYWQgd2hlbiBzb21lIGZpbGUgd2FzIGNoYW5nZWRcbiAqIEByZXR1cm4ge2ltcG9ydCgndml0ZScpLlBsdWdpbn1cbiAqL1xuZnVuY3Rpb24gaGFuZGxlSG90UmVsb2FkKCkge1xuICAgIC8qKiBAdHlwZSB7aW1wb3J0KCd2aXRlJykuVml0ZURldlNlcnZlcnxudWxsfSAqL1xuICAgIGxldCByZW5kZXJlcldhdGNoU2VydmVyID0gbnVsbDtcblxuICAgIHJldHVybiB7XG4gICAgICAgIG5hbWU6ICdAdml0ZS1lbGVjdHJvbi1idWlsZGVyL3ByZWxvYWQtcHJvY2Vzcy1ob3QtcmVsb2FkJyxcblxuICAgICAgICBjb25maWcoY29uZmlnLCBlbnYpIHtcbiAgICAgICAgICAgIGlmIChlbnYubW9kZSAhPT0gJ2RldmVsb3BtZW50Jykge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgcmVuZGVyZXJXYXRjaFNlcnZlclByb3ZpZGVyID0gY29uZmlnLnBsdWdpbnMuZmluZChwID0+IHAubmFtZSA9PT0gJ0B2aXRlLWVsZWN0cm9uLWJ1aWxkZXIvcmVuZGVyZXItd2F0Y2gtc2VydmVyLXByb3ZpZGVyJyk7XG4gICAgICAgICAgICBpZiAoIXJlbmRlcmVyV2F0Y2hTZXJ2ZXJQcm92aWRlcikge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUmVuZGVyZXIgd2F0Y2ggc2VydmVyIHByb3ZpZGVyIG5vdCBmb3VuZCcpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZW5kZXJlcldhdGNoU2VydmVyID0gcmVuZGVyZXJXYXRjaFNlcnZlclByb3ZpZGVyLmFwaS5wcm92aWRlUmVuZGVyZXJXYXRjaFNlcnZlcigpO1xuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGJ1aWxkOiB7XG4gICAgICAgICAgICAgICAgICAgIHdhdGNoOiB7fSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSxcblxuICAgICAgICB3cml0ZUJ1bmRsZSgpIHtcbiAgICAgICAgICAgIGlmICghcmVuZGVyZXJXYXRjaFNlcnZlcikge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVuZGVyZXJXYXRjaFNlcnZlci53cy5zZW5kKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnZnVsbC1yZWxvYWQnLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sXG4gICAgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBcVosU0FBUyxnQ0FBZ0M7QUFDOWIsU0FBUyw2QkFBNkI7QUFEMk4sSUFBTSwyQ0FBMkM7QUFHbFQsSUFBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFJTjtBQUFBLElBQ0csT0FBTztBQUFBLE1BQ0gsS0FBSztBQUFBLE1BQ0wsV0FBVztBQUFBLE1BQ1gsUUFBUTtBQUFBLE1BQ1IsUUFBUSxTQUFTLHNCQUFzQixDQUFDO0FBQUEsTUFDeEMsV0FBVztBQUFBLE1BQ1gsS0FBSztBQUFBLFFBQ0QsT0FBTyxDQUFDLGtCQUFrQixvQkFBb0I7QUFBQSxNQUNsRDtBQUFBLE1BQ0EsZUFBZTtBQUFBLFFBQ1gsUUFBUTtBQUFBLFVBQ0o7QUFBQTtBQUFBO0FBQUEsWUFHSSxnQkFBZ0I7QUFBQSxVQUNwQjtBQUFBLFFBQ0o7QUFBQSxNQUNKO0FBQUEsTUFDQSxhQUFhO0FBQUEsTUFDYixzQkFBc0I7QUFBQSxJQUMxQjtBQUFBLElBQ0EsU0FBUyxDQUFDLFlBQVksR0FBRyxnQkFBZ0IsQ0FBQztBQUFBLEVBQzlDO0FBQUE7QUFvQkEsU0FBUyxjQUFjO0FBQ25CLFFBQU0sa0JBQWtCO0FBQ3hCLFFBQU0sMEJBQTBCLE9BQU87QUFFdkMsU0FBTztBQUFBLElBQ0gsTUFBTTtBQUFBLElBQ04sVUFBVSxJQUFJO0FBQ1YsVUFBSSxHQUFHLFNBQVMsZUFBZSxHQUFHO0FBQzlCLGVBQU87QUFBQSxNQUNYO0FBQUEsSUFDSjtBQUFBLElBQ0EsTUFBTSxLQUFLLElBQUk7QUFDWCxVQUFJLE9BQU8seUJBQXlCO0FBQ2hDLGNBQU0sZ0JBQWdCLE1BQU0seUJBQXlCLGtCQUFrQjtBQUFBLFVBQ25FLEtBQUs7QUFBQSxRQUNULENBQUM7QUFDRCxlQUFPLGNBQWMsT0FBTyxDQUFDLEdBQUcsUUFBUTtBQUNwQyxpQkFDSSxLQUNYLFFBQVEsWUFDSCw4QkFBOEIsS0FBSyxHQUFHLENBQUM7QUFBQSxJQUN2QyxnQkFBZ0IsR0FBRyxrQkFBa0IsS0FBSyxHQUFHLENBQUM7QUFBQTtBQUFBLFFBRWhELEdBQUcsRUFBRTtBQUFBLE1BQ1Q7QUFBQSxJQUNKO0FBQUEsRUFDSjtBQUNKO0FBT0EsU0FBUyxrQkFBa0I7QUFFdkIsTUFBSSxzQkFBc0I7QUFFMUIsU0FBTztBQUFBLElBQ0gsTUFBTTtBQUFBLElBRU4sT0FBTyxRQUFRLEtBQUs7QUFDaEIsVUFBSSxJQUFJLFNBQVMsZUFBZTtBQUM1QjtBQUFBLE1BQ0o7QUFFQSxZQUFNLDhCQUE4QixPQUFPLFFBQVEsS0FBSyxPQUFLLEVBQUUsU0FBUyx1REFBdUQ7QUFDL0gsVUFBSSxDQUFDLDZCQUE2QjtBQUM5QixjQUFNLElBQUksTUFBTSwwQ0FBMEM7QUFBQSxNQUM5RDtBQUVBLDRCQUFzQiw0QkFBNEIsSUFBSSwyQkFBMkI7QUFFakYsYUFBTztBQUFBLFFBQ0gsT0FBTztBQUFBLFVBQ0gsT0FBTyxDQUFDO0FBQUEsUUFDWjtBQUFBLE1BQ0o7QUFBQSxJQUNKO0FBQUEsSUFFQSxjQUFjO0FBQ1YsVUFBSSxDQUFDLHFCQUFxQjtBQUN0QjtBQUFBLE1BQ0o7QUFFQSwwQkFBb0IsR0FBRyxLQUFLO0FBQUEsUUFDeEIsTUFBTTtBQUFBLE1BQ1YsQ0FBQztBQUFBLElBQ0w7QUFBQSxFQUNKO0FBQ0o7IiwKICAibmFtZXMiOiBbXQp9Cg==
