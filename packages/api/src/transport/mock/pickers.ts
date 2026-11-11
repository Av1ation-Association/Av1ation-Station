export function pickBrowserFile(accept: string): Promise<string | null> {
    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.addEventListener("change", () => {
            const file = input.files?.[0];
            resolve(file === undefined ? null : `C:\\Users\\demo\\Videos\\${file.name}`);
        });
        input.addEventListener("cancel", () => resolve(null));
        input.click();
    });
}

export function pickBrowserFiles(accept: string): Promise<readonly string[]> {
    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.accept = accept;
        input.addEventListener("change", () => {
            resolve(
                [...(input.files ?? [])].map((file) => `C:\\Users\\demo\\Videos\\${file.name}`),
            );
        });
        input.addEventListener("cancel", () => resolve([]));
        input.click();
    });
}
