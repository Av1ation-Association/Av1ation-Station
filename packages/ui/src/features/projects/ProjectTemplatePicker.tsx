import { Command } from "cmdk";
import { ChevronDown, Layers, Search, Star } from "lucide-react";

import type { ProjectTemplate } from "@av1ation/contracts";

import { Button } from "../../shared/Button";
import { Popover, PopoverContent, PopoverTrigger } from "../../shared/Popover";

/**
 * The searchable template picker.
 *
 * It is a Popover containing a Command, not a menu with a text field inside it: the input
 * owns every keystroke, while the list keeps the combobox semantics the pattern needs.
 */
export function ProjectTemplatePicker({
    templates,
    filteredTemplates,
    query,
    onQueryChange,
    open,
    onOpenChange,
    disabled,
    pending,
    defaultTemplateId,
    onApply,
}: {
    templates: readonly ProjectTemplate[];
    filteredTemplates: readonly ProjectTemplate[];
    query: string;
    onQueryChange: (value: string) => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    disabled: boolean;
    pending: boolean;
    defaultTemplateId: string | undefined;
    onApply: (template: ProjectTemplate) => void;
}) {
    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    variant="secondary"
                    className="h-8 px-3 text-[12px]"
                    disabled={disabled}
                    title={
                        templates.length === 0
                            ? "Create a template in Settings → Project Templates first."
                            : undefined
                    }
                >
                    <Layers aria-hidden="true" className="h-3.5 w-3.5" />
                    {pending ? "Applying…" : "Apply Template"}
                    <ChevronDown aria-hidden="true" className="h-3 w-3" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[320px] p-0">
                <Command
                    shouldFilter={false}
                    className="flex h-full w-full flex-col overflow-hidden rounded-md bg-overlay font-sans text-ink"
                >
                    <div className="relative border-b border-line">
                        <Search
                            aria-hidden="true"
                            className="pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-ink-muted"
                        />
                        <Command.Input
                            autoFocus
                            value={query}
                            onValueChange={onQueryChange}
                            placeholder="Search templates"
                            className="h-8 w-full border-0 bg-transparent pr-2 pl-7 font-sans text-[12px] text-ink outline-none placeholder:text-ink-muted"
                        />
                    </div>
                    <Command.List className="max-h-64 overflow-y-auto p-1">
                        <Command.Empty className="px-2.5 py-2 text-[12px] text-ink-muted">
                            No template matches that search.
                        </Command.Empty>
                        <Command.Group className="p-0">
                            {filteredTemplates.map((template) => (
                                <Command.Item
                                    key={template.id}
                                    value={`${template.name} ${template.id}`}
                                    onSelect={() => onApply(template)}
                                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-[12px] text-ink-secondary data-[selected=true]:bg-hover data-[selected=true]:text-ink"
                                >
                                    <span className="min-w-0 flex-1 truncate">{template.name}</span>
                                    {template.id === defaultTemplateId ? (
                                        <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-brand">
                                            <Star
                                                aria-hidden="true"
                                                className="h-2.5 w-2.5"
                                                fill="currentColor"
                                            />
                                            Default
                                        </span>
                                    ) : null}
                                </Command.Item>
                            ))}
                        </Command.Group>
                    </Command.List>
                </Command>
                <p className="m-0 border-t border-line px-2.5 py-1.5 text-[10.5px] leading-relaxed text-ink-muted">
                    Replaces this project&apos;s configuration and General defaults. Video overrides
                    are kept.
                </p>
            </PopoverContent>
        </Popover>
    );
}
