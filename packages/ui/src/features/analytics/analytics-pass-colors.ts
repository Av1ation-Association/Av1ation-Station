/**
 * The colour a pass is drawn with.
 *
 * The chart resolves these tokens against the active theme and the chips use the same
 * variables, so a chip and its line cannot be two different colours in either theme.
 */
const PASS_TOKENS = [
    "--accent-1",
    "--accent-2",
    "--accent-3",
    "--accent-4",
    "--accent-5",
    "--accent-6",
] as const;

export function passColorToken(pass: number): string {
    const index = (Math.max(1, pass) - 1) % PASS_TOKENS.length;
    return PASS_TOKENS[index] ?? "--accent-1";
}

export function passColorVariable(pass: number): string {
    return `var(${passColorToken(pass)})`;
}
