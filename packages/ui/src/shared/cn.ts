import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Compose Tailwind classes with the same precedence rules as the shadcn sources. */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}
