/** The engine's tagged filter object, split into its variant tag and payload. */
function filterParts(entry: unknown): { tag: string; payload: Record<string, unknown> } {
    if (typeof entry !== "object" || entry === null) {
        return { tag: "Filter", payload: {} };
    }
    const [tag, payload] = Object.entries(entry)[0] ?? [];
    return {
        tag: tag ?? "Filter",
        payload:
            typeof payload === "object" && payload !== null
                ? (payload as Record<string, unknown>)
                : {},
    };
}

function filterTagLabel(tag: string): string {
    return tag === "OutputFormat" ? "Output format" : tag;
}

/**
 * A one-line row summary: the variant plus the few fields that identify it.
 *
 * Every filter list shows the same summary so a reference filter in Noise Detector reads
 * the way the same filter reads in an input's chain.
 */
export function filterSummary(entry: unknown): string {
    const { tag, payload } = filterParts(entry);
    const bits: string[] = [];
    const width = payload.width;
    const height = payload.height;
    if (typeof width === "number" && typeof height === "number") {
        bits.push(`${String(width)}×${String(height)} px`);
    }
    if (typeof payload.bit_depth === "number") {
        bits.push(`${String(payload.bit_depth)}-bit`);
    }
    if (typeof payload.chroma === "string") {
        bits.push(payload.chroma);
    }
    if (typeof payload.format === "string") {
        bits.push(payload.format);
    }
    if (typeof payload.scaler === "string") {
        bits.push(payload.scaler);
    }
    if (typeof payload.start === "number" || typeof payload.end === "number") {
        bits.push(`${String(payload.start ?? 0)}–${String(payload.end ?? "end")}`);
    }
    if (Array.isArray(payload.sigma)) {
        const sigmas = payload.sigma.filter(
            (value): value is number => typeof value === "number" && value !== 0,
        );
        if (sigmas.length > 0) {
            bits.push(`sigma ${sigmas.join("/")}`);
        }
    } else if (typeof payload.sigma === "number") {
        bits.push(`sigma ${String(payload.sigma)}`);
    }
    if (typeof payload.radius === "number") {
        bits.push(`radius ${String(payload.radius)}`);
    }
    return bits.length === 0 ? filterTagLabel(tag) : `${filterTagLabel(tag)} · ${bits.join(" · ")}`;
}
