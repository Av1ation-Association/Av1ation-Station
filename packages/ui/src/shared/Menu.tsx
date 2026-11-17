import { createContext, useContext, type ReactNode } from "react";

import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";

import { cn } from "./cn";
import { useEmbeddedDemoHost } from "./demo-mode";

type MenuMode = "dropdown" | "context";

const MenuModeContext = createContext<MenuMode>("dropdown");

type MenuProps = {
    mode?: MenuMode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    modal?: boolean;
    children: ReactNode;
};

/**
 * The one action-menu root.
 *
 * A trigger menu and a pointer menu have the same items, focus model, and keyboard rules;
 * only the Radix root differs. Keeping the choice here means a screen never composes a
 * second, subtly different menu implementation.
 */
export function Menu({ mode = "dropdown", modal, ...props }: MenuProps) {
    // A modal Radix menu locks body scrolling and marks every sibling aria-hidden. That is
    // correct for the desktop document, but in the marketing embed it would hide the article
    // around the demo. The host context is the single switch for every menu call site.
    const embedded = useEmbeddedDemoHost() !== null;
    const resolvedModal = embedded ? false : (modal ?? true);
    if (mode === "context") {
        return (
            <MenuModeContext.Provider value="context">
                <ContextMenuPrimitive.Root {...props} modal={resolvedModal} />
            </MenuModeContext.Provider>
        );
    }
    return (
        <MenuModeContext.Provider value="dropdown">
            <DropdownMenuPrimitive.Root {...props} modal={resolvedModal} />
        </MenuModeContext.Provider>
    );
}

const triggerClass =
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

type MenuTriggerProps = {
    asChild?: boolean;
    disabled?: boolean;
    className?: string;
    children: ReactNode;
};

/** The element that opens a trigger menu, or the region a pointer menu watches. */
export function MenuTrigger({ className, ...props }: MenuTriggerProps) {
    const mode = useContext(MenuModeContext);
    const classes = cn(triggerClass, className);
    if (mode === "context") {
        return <ContextMenuPrimitive.Trigger className={classes} {...props} />;
    }
    return <DropdownMenuPrimitive.Trigger className={classes} {...props} />;
}

const contentClass =
    "z-50 max-h-[70dvh] min-w-[10rem] overflow-x-hidden overflow-y-auto rounded-md border border-line-strong bg-overlay p-1 text-ink shadow-elevation-3 outline-none";

type MenuContentProps = {
    children: ReactNode;
    className?: string;
    align?: "start" | "center" | "end";
    side?: "top" | "right" | "bottom" | "left";
    sideOffset?: number;
    /** Keep the portalled surface inside the viewport rather than past its edge. */
    collisionPadding?: number;
    "aria-label"?: string;
    onCloseAutoFocus?: (event: Event) => void;
    onEscapeKeyDown?: (event: KeyboardEvent) => void;
};

/** The menu surface; it portals so an overflow-hidden row cannot clip it. */
export function MenuContent({
    children,
    className,
    align,
    side,
    sideOffset = 4,
    collisionPadding = 8,
    ...props
}: MenuContentProps) {
    const mode = useContext(MenuModeContext);
    const portalContainer = useEmbeddedDemoHost()?.portalContainer;
    const portalProps =
        portalContainer === null || portalContainer === undefined
            ? {}
            : { container: portalContainer };
    const classes = cn(contentClass, className);
    if (mode === "context") {
        return (
            <ContextMenuPrimitive.Portal {...portalProps}>
                <ContextMenuPrimitive.Content
                    className={classes}
                    side={side}
                    sideOffset={sideOffset}
                    collisionPadding={collisionPadding}
                    {...props}
                >
                    {children}
                </ContextMenuPrimitive.Content>
            </ContextMenuPrimitive.Portal>
        );
    }
    return (
        <DropdownMenuPrimitive.Portal {...portalProps}>
            <DropdownMenuPrimitive.Content
                className={classes}
                align={align}
                side={side}
                sideOffset={sideOffset}
                collisionPadding={collisionPadding}
                {...props}
            >
                {children}
            </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
    );
}

const itemClass =
    "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-[12px] text-ink-secondary outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-hover data-[highlighted]:text-ink";

type MenuItemProps = {
    children: ReactNode;
    className?: string | undefined;
    disabled?: boolean | undefined;
    asChild?: boolean | undefined;
    title?: string | undefined;
    tone?: "default" | "danger" | undefined;
    onSelect?: ((event: Event) => void) | undefined;
};

/** One action, with the same disabled and danger treatment in every menu. */
export function MenuItem({ className, tone = "default", ...props }: MenuItemProps) {
    const mode = useContext(MenuModeContext);
    const classes = cn(
        itemClass,
        tone === "danger" && "data-[highlighted]:bg-danger-soft data-[highlighted]:text-danger",
        className,
    );
    if (mode === "context") {
        return <ContextMenuPrimitive.Item className={classes} {...props} />;
    }
    return <DropdownMenuPrimitive.Item className={classes} {...props} />;
}

/** A non-interactive heading inside a menu. */
export function MenuLabel({ children, className }: { children: ReactNode; className?: string }) {
    const mode = useContext(MenuModeContext);
    const classes = cn(
        "px-2 py-1 font-mono text-[9.5px] leading-relaxed text-ink-muted",
        className,
    );
    if (mode === "context") {
        return (
            <ContextMenuPrimitive.Label className={classes}>{children}</ContextMenuPrimitive.Label>
        );
    }
    return (
        <DropdownMenuPrimitive.Label className={classes}>{children}</DropdownMenuPrimitive.Label>
    );
}

/** A rule between menu groups. */
export function MenuSeparator({ className }: { className?: string }) {
    const mode = useContext(MenuModeContext);
    const classes = cn("my-1 h-px bg-line", className);
    if (mode === "context") {
        return <ContextMenuPrimitive.Separator className={classes} />;
    }
    return <DropdownMenuPrimitive.Separator className={classes} />;
}

type MenuRadioGroupProps = {
    value: string;
    onValueChange: (value: string) => void;
    children: ReactNode;
};

/** A group whose selected value is announced as a radio item. */
export function MenuRadioGroup(props: MenuRadioGroupProps) {
    const mode = useContext(MenuModeContext);
    if (mode === "context") {
        return <ContextMenuPrimitive.RadioGroup {...props} />;
    }
    return <DropdownMenuPrimitive.RadioGroup {...props} />;
}

type MenuRadioItemProps = {
    value: string;
    children: ReactNode;
    className?: string;
    disabled?: boolean;
    onSelect?: (event: Event) => void;
};

/** One radio choice with a single, shared selected indicator. */
export function MenuRadioItem({ children, className, ...props }: MenuRadioItemProps) {
    const mode = useContext(MenuModeContext);
    const classes = cn(itemClass, "items-start", className);
    const item = (
        <>
            <span className="min-w-0 flex-1">{children}</span>
            <ItemIndicator />
        </>
    );
    if (mode === "context") {
        return (
            <ContextMenuPrimitive.RadioItem className={classes} {...props}>
                {item}
            </ContextMenuPrimitive.RadioItem>
        );
    }
    return (
        <DropdownMenuPrimitive.RadioItem className={classes} {...props}>
            {item}
        </DropdownMenuPrimitive.RadioItem>
    );
}

function ItemIndicator() {
    const mode = useContext(MenuModeContext);
    const dot = (
        <span className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-brand">
            <Check aria-hidden="true" className="h-3 w-3" strokeWidth={2.2} />
        </span>
    );
    if (mode === "context") {
        return (
            <ContextMenuPrimitive.ItemIndicator asChild>{dot}</ContextMenuPrimitive.ItemIndicator>
        );
    }
    return <DropdownMenuPrimitive.ItemIndicator asChild>{dot}</DropdownMenuPrimitive.ItemIndicator>;
}
