import forksJson from "../../gallery/encoder-forks.json";

interface ForkDescriptor {
    readonly label: string;
    readonly description?: string | null;
    readonly group?: string | null;
    readonly default?: unknown;
    readonly advanced?: boolean;
}

interface ForkProfile {
    readonly id: string;
    readonly label: string;
    readonly base: string;
    readonly doc_link: string;
    readonly parameters: Record<string, ForkDescriptor>;
}

const FORKS = forksJson as unknown as Record<string, ForkProfile>;
const ORDER = ["svt-av1-essential", "svt-av1-5fish"] as const;

function formatDefault(value: unknown): string {
    if (value === null || value === undefined) return "unset";
    if (typeof value === "boolean") return value ? "on" : "off";
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
}

function rows(profile: ForkProfile): Array<[string, ForkDescriptor]> {
    return Object.entries(profile.parameters).sort(([leftKey, left], [rightKey, right]) => {
        const group = (left.group ?? "").localeCompare(right.group ?? "");
        return group === 0
            ? left.label.localeCompare(right.label) || leftKey.localeCompare(rightKey)
            : group;
    });
}

/**
 * The complete shipped parameter tables for the two known SVT-AV1 forks.
 *
 * These are catalogue rows, not a probe of the reader's executable. The profile is chosen
 * from the full help when a build is added; the table is independent of the build version,
 * so a row that a particular binary omits is still documented here.
 */
export function ForkParameterTables() {
    return (
        <div className="docs-forks">
            {ORDER.map((id) => {
                const profile = FORKS[id];
                if (profile === undefined) return null;
                const parameters = rows(profile);
                return (
                    <section className="docs-fork" key={id}>
                        <h3>{profile.label}</h3>
                        <p>
                            A build of <code>{profile.base}</code> with its own table. Nothing is
                            bundled; add the executable in Settings → Encoders and the profile is
                            detected from its full help.{" "}
                            <a href={profile.doc_link}>Fork parameter documentation</a>
                        </p>
                        <details>
                            <summary>
                                {parameters.length} parameters · {profile.label}
                            </summary>
                            <div className="docs-field-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th scope="col">Group</th>
                                            <th scope="col">Label</th>
                                            <th scope="col">Flag</th>
                                            <th scope="col">Default</th>
                                            <th scope="col">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parameters.map(([flag, descriptor]) => (
                                            <tr key={flag}>
                                                <td>{descriptor.group ?? "Parameters"}</td>
                                                <td>{descriptor.label}</td>
                                                <td>
                                                    <code>{flag}</code>
                                                </td>
                                                <td>{formatDefault(descriptor.default)}</td>
                                                <td>{descriptor.description ?? ""}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </details>
                    </section>
                );
            })}
        </div>
    );
}
