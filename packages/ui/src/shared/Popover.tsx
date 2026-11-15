import type { ComponentPropsWithoutRef } from "react";

import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "./cn";
import { useEmbeddedDemoHost } from "./demo-mode";

type PopoverProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Root>;

/** The one rich-content root; the embedded demo never lets it become a page-level modal. */
export function Popover(props: PopoverProps) {
    const embedded = useEmbeddedDemoHost() !== null;
    return <PopoverPrimitive.Root {...props} modal={embedded ? false : props.modal} />;
}

export const PopoverTrigger = PopoverPrimitive.Trigger;

/** The one rich-content surface; it is not a menu and carries no menu semantics. */
export function PopoverContent({
    className,
    align = "center",
    sideOffset = 4,
    ...props
}: ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
    const portalContainer = useEmbeddedDemoHost()?.portalContainer;
    const portalProps =
        portalContainer === null || portalContainer === undefined
            ? {}
            : { container: portalContainer };
    return (
        <PopoverPrimitive.Portal {...portalProps}>
            <PopoverPrimitive.Content
                align={align}
                sideOffset={sideOffset}
                className={cn(
                    "z-50 rounded-md border border-line-strong bg-overlay p-0 text-ink shadow-elevation-3 outline-none",
                    className,
                )}
                {...props}
            />
        </PopoverPrimitive.Portal>
    );
}
