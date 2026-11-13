import { stopHosts } from "./support/hosts";

export default async function globalTeardown(): Promise<void> {
    await stopHosts();
}
