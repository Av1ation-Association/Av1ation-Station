// TanStack reads per-route static data through this interface. The augmentation lives
// here, rather than in `route-meta.ts`, so a non-router harness can import the registry
// without pulling React Router's module declarations into its TypeScript project.
import type { BackResolver, SearchParser, TrailKind, TrailParam } from "./route-meta";

declare module "@tanstack/react-router" {
    interface StaticDataRouteOption {
        trail: TrailKind;
        params: readonly TrailParam[];
        back: BackResolver;
        search?: SearchParser;
    }
}
