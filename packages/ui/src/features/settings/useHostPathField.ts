import { useEffect, useRef, useState } from "react";

/** What an empty draft means: clear the setting, or refuse it with the row's copy. */
export type HostPathEmptyPolicy = "clear" | { reject: string };

export interface HostPathFieldOptions<T> {
    /**
     * The saved value the draft follows, or omitted when the row starts empty and keeps
     * whatever the user types.
     */
    stored?: string;
    /** The host's picker, `null` where the host has none. */
    pick: ((defaultPath?: string) => Promise<string | null>) | null | undefined;
    /** Apply a value, or `null` to clear it; the promise resolves to the row's result. */
    save: (value: string | null) => Promise<T>;
    /** What an empty draft does: a model or interpreter clears; an executable rejects. */
    empty: HostPathEmptyPolicy;
    /** The row's own save-failure sentence, including any error detail it wants. */
    describeSaveFailure: (error: unknown) => string;
}

export interface HostPathFieldState<T> {
    path: string;
    /** A picker failure, or an empty draft the row refused. */
    fieldError: string | null;
    /** A save or probe the service rejected. */
    saveError: string | null;
    /** The last successful save or probe, cleared when the draft changes. */
    result: T | null;
    pending: boolean;
    canPick: boolean;
    edit: (next: string) => void;
    locate: (startFrom: string) => void;
    /**
     * Apply the draft, or an explicit candidate for a control that is not the text field,
     * such as the interpreter's **Automatic** entry or a clear action.
     */
    submit: (candidate?: string) => void;
}

/**
 * One draft-and-write lifecycle for a settings row that names a host path.
 *
 * The draft, its re-sync with the saved value, the picker, trim, the empty policy, the
 * write, pending, the last result, and the two failure channels live here, so a row
 * supplies only where the value starts, how to save it, and its copy. A host without a
 * picker keeps the typed field and its own save path (`AGENTS.md` §2.7).
 */
export function useHostPathField<T>({
    stored,
    pick,
    save,
    empty,
    describeSaveFailure,
}: HostPathFieldOptions<T>): HostPathFieldState<T> {
    const [path, setPath] = useState(stored ?? "");
    const [fieldError, setFieldError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [result, setResult] = useState<T | null>(null);
    const [pending, setPending] = useState(false);
    // A synchronous guard, because two events in one frame can both see pending false.
    const pendingRef = useRef(false);
    const saveRef = useRef(save);
    const describeSaveFailureRef = useRef(describeSaveFailure);

    useEffect(() => {
        saveRef.current = save;
        describeSaveFailureRef.current = describeSaveFailure;
    }, [save, describeSaveFailure]);

    // A saved value that changes out of band (a refetched settings document, a refreshed
    // inventory) replaces the draft. An unchanged refetch leaves what the user is typing.
    useEffect(() => {
        if (stored !== undefined) {
            setPath(stored);
        }
    }, [stored]);

    const edit = (next: string) => {
        setPath(next);
        setFieldError(null);
        setSaveError(null);
        setResult(null);
    };

    const run = async (value: string | null) => {
        if (pendingRef.current) {
            return;
        }
        pendingRef.current = true;
        setPending(true);
        setFieldError(null);
        setSaveError(null);
        setResult(null);
        try {
            const next = await saveRef.current(value);
            setResult(next);
        } catch (error) {
            setSaveError(describeSaveFailureRef.current(error));
        } finally {
            pendingRef.current = false;
            setPending(false);
        }
    };

    const submit = (candidate?: string) => {
        if (pendingRef.current) {
            return;
        }
        const trimmed = (candidate ?? path).trim();
        if (trimmed === "") {
            if (empty === "clear") {
                void run(null);
            } else {
                setFieldError(empty.reject);
                setSaveError(null);
                setResult(null);
            }
            return;
        }
        void run(trimmed);
    };

    const locate = (startFrom: string) => {
        if (pick === null || pick === undefined || pendingRef.current) {
            return;
        }
        const choose = pick;
        const trimmed = startFrom.trim();
        setFieldError(null);
        setSaveError(null);
        setResult(null);
        void (async () => {
            let picked: string | null;
            try {
                picked = await choose(trimmed === "" ? undefined : trimmed);
            } catch (pickFailure) {
                setFieldError(
                    pickFailure instanceof Error
                        ? `The file picker could not open: ${pickFailure.message}`
                        : "The file picker could not open. Type the path instead.",
                );
                return;
            }
            if (picked === null || pendingRef.current) {
                return;
            }
            setPath(picked);
            await run(picked);
        })();
    };

    return {
        path,
        fieldError,
        saveError,
        result,
        pending,
        canPick: pick !== null && pick !== undefined,
        edit,
        locate,
        submit,
    };
}
