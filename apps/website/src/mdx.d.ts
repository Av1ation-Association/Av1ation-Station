declare module "*.mdx" {
    import type { ComponentType, ElementType } from "react";

    const MDXComponent: ComponentType<{ components?: Record<string, ElementType> }>;
    export default MDXComponent;
}

declare module "virtual:svt-parameters" {
    import type { ParameterDescriptor } from "@av1ation/contracts";

    const parameters: Record<string, ParameterDescriptor>;
    export default parameters;
}
