# Applications

The three runnable JavaScript hosts. Each mounts the same shared UI and injects a different
transport; application components do not live here.

| Host | Responsibility |
| --- | --- |
| `desktop/` | Desktop webview entry. Native window, dialogs, and IPC live in `rust/desktop-shell/`. |
| `web/` | LAN browser build. It injects the HTTP transport with the user-supplied origin. |
| `website/` | Public demo. It injects `MockTransport`; the landing page and docs are deferred to Phase 6. |

A behavior needed by more than one host belongs in `packages/ui` or `packages/api`, not in
an `apps/*` entry. The desktop host is split deliberately: `apps/desktop` owns the Vite
bundle, while `rust/desktop-shell` owns everything that must run in the native process.
