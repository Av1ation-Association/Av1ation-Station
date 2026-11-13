import { startHosts } from "./support/hosts";

export default async function globalSetup(): Promise<void> {
    await startHosts();
}
