# Packages

Shared TypeScript workspace. Packages point downward only:

```
contracts  ←  api  ←  ui  ←  apps/*
```

| Package | Responsibility |
| --- | --- |
| `contracts/` | Generated TypeScript types and Zod validators from `schema/<group>/*.json`. Never hand-edit the generated files. |
| `api/` | The one transport façade, TanStack Query hooks, live event handling, and the mock transport. No JSX. |
| `ui/` | Application shell, routes, feature folders, shared primitives, and design tokens. |
| `config/` | Shared ESLint, Prettier, and TypeScript presets. |

`ui/src/features/<domain>/` is the default home for UI work: the screen, its components,
its model, and its tests stay together. A control moves to `ui/src/shared/` only when more
than one feature uses it. The API hook modules mirror the feature domains under
`api/src/api/`.
