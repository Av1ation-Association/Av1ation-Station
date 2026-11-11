import * as SwitchPrimitive from "@radix-ui/react-switch";

/**
 * The one switch used by a configuration stage or an encoder setting.
 *
 * A switch is a binary state, so it carries no "On" copy of its own: the thumb and the
 * track colour are the state. The accessible name always comes from `label`, never from
 * the visible text beside it, so a caller can put the label in a row header.
 */
export function Switch({
    checked,
    onChange,
    label,
    disabled = false,
}: {
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
    disabled?: boolean;
}) {
    return (
        <SwitchPrimitive.Root
            checked={checked}
            onCheckedChange={onChange}
            aria-label={label}
            disabled={disabled}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 ${
                checked ? "border-brand bg-brand" : "border-line-strong bg-sunken"
            }`}
        >
            <SwitchPrimitive.Thumb
                className={`block h-3.5 w-3.5 rounded-full transition-transform duration-150 ${
                    checked ? "translate-x-[18px] bg-on-brand" : "translate-x-[3px] bg-ink-muted"
                }`}
            />
        </SwitchPrimitive.Root>
    );
}
