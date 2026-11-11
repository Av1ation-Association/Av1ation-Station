import type { ButtonHTMLAttributes } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./cn";

const buttonVariants = cva(
    "inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-40",
    {
        variants: {
            variant: {
                primary: "bg-brand text-on-brand hover:bg-brand-hover focus-visible:outline-brand",
                secondary:
                    "border border-line-strong bg-raised text-ink hover:border-ink-muted hover:bg-hover",
                ghost: "text-ink-secondary hover:bg-hover hover:text-ink",
                danger: "bg-danger text-white hover:opacity-90",
                dangerGhost: "text-danger hover:bg-danger-soft",
                // A start/stop pair reads as one neutral control until it is pointed at, so the
                // tint says what the click will do instead of colouring both buttons at rest.
                dangerOutline:
                    "border border-line-strong bg-raised text-ink hover:border-danger/50 hover:bg-danger-soft hover:text-danger",
                successGhost:
                    "border border-line-strong bg-raised text-ink hover:border-success/50 hover:bg-success-soft hover:text-success",
                brandGhost:
                    "border border-brand/40 bg-transparent text-brand-text hover:border-brand/70 hover:bg-brand-soft",
            },
        },
        defaultVariants: {
            variant: "primary",
        },
    },
);

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

export interface ButtonProps
    extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

/**
 * A treatment's classes, for the rare action that must render as a link.
 *
 * A router `Link` cannot be a `<button>`, and copying the treatment by hand is how the
 * JSON link drifted from the button beside it. Callers add only sizing on top.
 */
export function buttonClass(variant: ButtonVariant = "primary", className = ""): string {
    return cn(buttonVariants({ variant }), className);
}

/** A headless button with the treatments the scaffold's screens need. */
export function Button({
    className = "",
    variant = "primary",
    type = "button",
    title,
    ...props
}: ButtonProps) {
    // A `title` is a hint, and the platform draws hints in the window manager's style. Every
    // caller already supplies the right words, so the button translates them once into the
    // application's own tooltip instead of each screen repeating the attribute.
    return (
        <button
            type={type}
            className={buttonClass(variant ?? "primary", className)}
            {...(title === undefined ? {} : { "data-tip": title })}
            {...props}
        />
    );
}
