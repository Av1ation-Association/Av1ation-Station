import { Clapperboard, FileText, History, SlidersHorizontal } from "lucide-react";

/** The four surfaces one video owns, in the order the Penpot board draws them. */
export const VIDEO_TABS = [
    {
        id: "configuration",
        label: "Configuration",
        to: "/projects/$projectId/videos/$videoId",
        icon: SlidersHorizontal,
    },
    {
        id: "scenes",
        label: "Scenes",
        to: "/projects/$projectId/videos/$videoId/scenes",
        icon: Clapperboard,
    },
    {
        id: "history",
        label: "History",
        to: "/projects/$projectId/videos/$videoId/history",
        icon: History,
    },
    {
        id: "logs",
        label: "Logs",
        to: "/projects/$projectId/videos/$videoId/logs",
        icon: FileText,
    },
] as const;

export type VideoTabId = (typeof VIDEO_TABS)[number]["id"];
