import { useState } from "react";

import {
    Menu,
    MenuContent,
    MenuLabel,
    MenuRadioGroup,
    MenuRadioItem,
    MenuSeparator,
    MenuTrigger,
} from "../../shared/Menu";
import { SOURCES, type PreviewSource } from "./preview-player";

type PreviewSourceMenuProps = {
    source: PreviewSource;
    sceneIndex: number | null;
    chooseSource: (next: PreviewSource) => void;
    encodeFrom: "decoded" | "original";
    setEncodeFrom: (next: "decoded" | "original") => void;
};

/** The transport's preview-source picker and Encoded-from choice. */
export function PreviewSourceMenu({
    source,
    sceneIndex,
    chooseSource,
    encodeFrom,
    setEncodeFrom,
}: PreviewSourceMenuProps) {
    const [open, setOpen] = useState(false);
    const status = SOURCES[source];
    const SourceIcon = status.icon;

    return (
        <Menu open={open} onOpenChange={setOpen}>
            <MenuTrigger asChild>
                <button
                    type="button"
                    aria-label={`Preview source: ${status.label}`}
                    data-tip={open ? undefined : `Source: ${status.label}`}
                    data-tip-align="end"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line-strong bg-raised text-ink-secondary transition-colors duration-150 hover:border-ink-muted hover:bg-hover hover:text-ink"
                >
                    <SourceIcon aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
            </MenuTrigger>
            <MenuContent
                align="end"
                side="top"
                sideOffset={6}
                aria-label="Preview source"
                className="w-72"
            >
                <MenuRadioGroup
                    value={source}
                    onValueChange={(next) => chooseSource(next as PreviewSource)}
                >
                    {(Object.keys(SOURCES) as PreviewSource[]).map((id) => {
                        const entry = SOURCES[id];
                        const unavailable = id === "encode" && sceneIndex === null;
                        return (
                            <MenuRadioItem
                                key={id}
                                value={id}
                                disabled={unavailable}
                                onSelect={() => setOpen(false)}
                                className="items-start"
                            >
                                <span className="flex items-center gap-2 text-[11.5px] font-medium">
                                    {entry.label}
                                </span>
                                <span className="mt-0.5 block text-[10px] leading-snug text-ink-muted">
                                    {unavailable
                                        ? "No scene contains the playhead. Detect scenes or move the playhead inside one."
                                        : entry.detail}
                                </span>
                            </MenuRadioItem>
                        );
                    })}
                </MenuRadioGroup>
                {source === "encode" ? (
                    <>
                        <MenuSeparator />
                        <MenuLabel className="px-2 pt-2 pb-1 text-[9px] tracking-[0.08em] uppercase">
                            Encoded from
                        </MenuLabel>
                        <MenuRadioGroup
                            value={encodeFrom}
                            onValueChange={(next) => setEncodeFrom(next as "decoded" | "original")}
                        >
                            {(
                                [
                                    ["decoded", "Decoded", "The Encoding input"],
                                    ["original", "Original", "The General input"],
                                ] as const
                            ).map(([id, label, note]) => (
                                <MenuRadioItem
                                    key={id}
                                    value={id}
                                    onSelect={() => setOpen(false)}
                                    className="items-start"
                                >
                                    <span className="block text-[11.5px] font-medium">{label}</span>
                                    <span className="mt-0.5 block text-[10px] text-ink-muted">
                                        {note}
                                    </span>
                                </MenuRadioItem>
                            ))}
                        </MenuRadioGroup>
                    </>
                ) : null}
            </MenuContent>
        </Menu>
    );
}
