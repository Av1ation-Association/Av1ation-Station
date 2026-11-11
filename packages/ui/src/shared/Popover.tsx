import type { ComponentPropsWithoutRef } from "react";

import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "./cn";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

/** The one rich-content surface; it is not a menu and carries no menu semantics. */
export function PopoverContent({
    className,
    align = "center",
    sideOffset = 4,
    ...props
}: ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
    return (
        <PopoverPrimitive.Portal>
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
