/** Pipeline order: each stage consumes the previous stage's output. */
export const PROJECT_SECTIONS = [
    { id: "general", label: "General" },
    { id: "scene-detection", label: "Scene detection" },
    { id: "noise-generation", label: "Noise generation" },
    { id: "target-quality", label: "Target quality" },
    { id: "encoding", label: "Encoding" },
    { id: "concatenation", label: "Concatenation" },
    { id: "quality-check", label: "Quality check" },
] as const;

export type ProjectSectionId = (typeof PROJECT_SECTIONS)[number]["id"];

/**
 * Where a configuration document lives.
 *
 * A sequence override names a source and an index only in a video document: a project or a
 * template describes every video, so naming one file there would point the whole queue at
 * it. The copy follows the same split, so a template never claims to be a project.
 */
export type DocumentScope = "project" | "template" | "video";

export function sectionLabel(section: string): string {
    return PROJECT_SECTIONS.find((entry) => entry.id === section)?.label ?? section;
}

export function isProjectSection(section: string): section is ProjectSectionId {
    return PROJECT_SECTIONS.some((entry) => entry.id === section);
}
