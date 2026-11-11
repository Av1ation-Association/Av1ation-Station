/**
 * JSON equality with numeric tolerance.
 *
 * A value that round-trips through the engine may arrive as `1.0` where the project has
 * `1`; that is the same setting, and treating it as a change would mark a whole section
 * dirty. Objects compare by key regardless of insertion order, because an options map is
 * deserialised in the engine's order.
 */
export function sameValue(left: unknown, right: unknown): boolean {
    if (typeof left === "number" && typeof right === "number") {
        return Math.abs(left - right) < Number.EPSILON;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
        return (
            Array.isArray(left) &&
            Array.isArray(right) &&
            left.length === right.length &&
            left.every((entry, index) => sameValue(entry, right[index]))
        );
    }
    if (isRecord(left) || isRecord(right)) {
        if (!isRecord(left) || !isRecord(right)) {
            return false;
        }
        const leftKeys = Object.keys(left);
        const rightKeys = Object.keys(right);
        return (
            leftKeys.length === rightKeys.length &&
            leftKeys.every(
                (key) =>
                    Object.prototype.hasOwnProperty.call(right, key) &&
                    sameValue(left[key], right[key]),
            )
        );
    }
    return left === right;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
