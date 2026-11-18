import { HttpTransport, type HttpTransportOptions } from "@av1ation/api";
import { isLoopbackOrigin, mountApp, mountBrowserApp, mountHttpApp } from "@av1ation/ui";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";

/// In a native window the host injects the origin. In a browser dev session the same
/// running service can be named explicitly, which is how the desktop UI is reviewed
/// without a screenshot tool for the native window.
const injected = window.__AV1ATION_SERVICE_ORIGIN__;
const requested = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get("service")
    : null;
if (requested !== null) {
    window.sessionStorage.setItem("av1ation-dev-service", requested);
}
const developerOrigin = import.meta.env.DEV
    ? (requested ?? window.sessionStorage.getItem("av1ation-dev-service"))
    : null;
const origin = injected ?? developerOrigin;

/**
 * Tauri injects `__TAURI_INTERNALS__` only inside a real webview. A browser session pointed
 * at the same service (`?service=…`) has no IPC, so it must fall back to the shared text
 * field; passing the native pickers there turns every Locate click into a rejected invoke.
 */
const host: HttpTransportOptions =
    typeof window.__TAURI_INTERNALS__ === "undefined"
        ? {}
        : {
              pickFile: async (request) => {
                  const extensions = request?.extensions ?? [];
                  const selected = await open({
                      multiple: false,
                      directory: false,
                      title: request?.title ?? "Choose a file",
                      ...(extensions.length === 0
                          ? {}
                          : { filters: [{ name: "Files", extensions: [...extensions] }] }),
                  });
                  return typeof selected === "string" ? selected : null;
              },
              pickSaveFile: async (request) => {
                  const extensions = request?.extensions ?? [];
                  const selected = await save({
                      title: request?.title ?? "Choose where to write the file",
                      ...(request?.defaultPath === undefined || request.defaultPath === ""
                          ? {}
                          : { defaultPath: request.defaultPath }),
                      ...(extensions.length === 0
                          ? {}
                          : { filters: [{ name: "Files", extensions: [...extensions] }] }),
                  });
                  return typeof selected === "string" ? selected : null;
              },
              saveTextFile: async (suggestedName, text, options) => {
                  return await invoke<string | null>("save_text_file", {
                      suggestedName,
                      text,
                      title: options?.title ?? "Export",
                      extensions: [...(options?.extensions ?? ["txt"])],
                  });
              },
              pickExecutable: async (defaultPath) => {
                  const selected = await open({
                      multiple: false,
                      directory: false,
                      title: "Choose encoder executable",
                      ...(defaultPath === undefined || defaultPath === "" ? {} : { defaultPath }),
                  });
                  return typeof selected === "string" ? selected : null;
              },
              pickVideoFile: async (defaultPath) => {
                  const selected = await open({
                      multiple: false,
                      directory: false,
                      title: "Choose a video",
                      ...(defaultPath === undefined || defaultPath === "" ? {} : { defaultPath }),
                      filters: [
                          {
                              name: "Video",
                              extensions: ["mkv", "mp4", "mov", "m4v", "webm", "avi"],
                          },
                      ],
                  });
                  return typeof selected === "string" ? selected : null;
              },
              pickVideoFiles: async () => {
                  const selected = await open({
                      multiple: true,
                      directory: false,
                      title: "Choose videos",
                      filters: [
                          {
                              name: "Video",
                              extensions: ["mkv", "mp4", "mov", "m4v", "webm", "avi"],
                          },
                      ],
                  });
                  if (selected === null) {
                      return [];
                  }
                  return typeof selected === "string" ? [selected] : selected;
              },
              pickDirectory: async (defaultPath) => {
                  const selected = await open({
                      multiple: false,
                      directory: true,
                      title: "Choose a folder",
                      ...(defaultPath === undefined || defaultPath === "" ? {} : { defaultPath }),
                  });
                  return typeof selected === "string" ? selected : null;
              },
              pickScript: async () => {
                  const selected = await open({
                      multiple: false,
                      directory: false,
                      title: "Choose a VapourSynth script",
                      filters: [{ name: "VapourSynth script", extensions: ["vpy", "py"] }],
                  });
                  return typeof selected === "string" ? selected : null;
              },
              pickIndex: async () => {
                  const selected = await open({
                      multiple: false,
                      directory: false,
                      title: "Choose an FFMS2 index file",
                      filters: [{ name: "FFMS2 index", extensions: ["ffindex"] }],
                  });
                  return typeof selected === "string" ? selected : null;
              },
              pickModel: async (defaultPath) => {
                  const selected = await open({
                      multiple: false,
                      directory: false,
                      title: "Choose the TransNetV2 ONNX model",
                      ...(defaultPath === undefined || defaultPath === "" ? {} : { defaultPath }),
                      filters: [{ name: "ONNX model", extensions: ["onnx"] }],
                  });
                  return typeof selected === "string" ? selected : null;
              },
              revealPath: async (path) => {
                  await revealItemInDir(path);
              },
              openPath: async (path) => {
                  await openPath(path);
              },
              restartApp: async () => {
                  await invoke("restart_app");
              },
              onQuitRequest: (handler) => {
                  let unlisten: (() => void) | undefined;
                  let disposed = false;
                  void listen("quit-requested", () => handler()).then((stop) => {
                      if (disposed) {
                          stop();
                      } else {
                          unlisten = stop;
                      }
                  });
                  return () => {
                      disposed = true;
                      unlisten?.();
                  };
              },
              setQuitGuard: async (active) => {
                  await invoke("set_quit_guard", { active });
              },
              quit: async () => {
                  await invoke("quit_app");
              },
              setZoom: async (factor) => {
                  await invoke("set_webview_zoom", { factor });
              },
          };

if (!origin) {
    // A packaged build serves this same bundle from the service, where there is no Tauri
    // initialization script to inject the origin. A loopback page is the local listener,
    // which needs no credential; a page reached over the network is the LAN listener and
    // must pair. `host` stays empty because `__TAURI_INTERNALS__` is absent. A document
    // opened by the webview without an injected origin is a broken build, not a LAN page.
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
        if (isLoopbackOrigin(window.location.origin)) {
            mountHttpApp(window.location.origin, host);
        } else {
            mountBrowserApp(window.location.origin);
        }
    } else {
        const container = document.getElementById("root");
        if (container) {
            container.innerHTML =
                '<p style="font: 14px var(--font-stack-sans, system-ui); color: var(--text-secondary, #a3afc2); padding: 32px">' +
                "The desktop service origin was not injected. Launch the app through Tauri." +
                "</p>";
        }
    }
} else {
    // The Tauri host supplies the native pickers; the LAN browser and the website demo
    // leave the capabilities absent and use the shared text fields.
    mountApp(new HttpTransport(origin, host));
}
