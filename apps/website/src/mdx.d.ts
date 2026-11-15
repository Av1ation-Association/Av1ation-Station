declare module "*.mdx" {
    import type { ComponentType, ElementType } from "react";

    const MDXComponent: ComponentType<{ components?: Record<string, ElementType> }>;
    export default MDXComponent;
}
