import { mountBrowserApp } from "@av1ation/ui";

const configured = import.meta.env.VITE_SERVICE_ORIGIN;
const origin =
    typeof configured === "string" && configured.length > 0 ? configured : window.location.origin;

mountBrowserApp(origin);
