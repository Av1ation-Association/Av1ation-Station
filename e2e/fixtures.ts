import { expect, test as base } from "@playwright/test";

import { createRunJourney, type RunJourney } from "./support/run-journey";
import { readHosts, type Hosts } from "./support/hosts";
import { guardExternalRequests } from "./support/network";
import { createWorkspace, type Workspace } from "./support/workspace";

export { expect } from "@playwright/test";

type Fixtures = {
    hosts: Hosts;
    journeyFor: (origin: string) => RunJourney;
    workspaceFor: (origin: string) => Workspace;
};

export const test = base.extend<Fixtures>({
    // Installed on every page context the suite opens. The LAN journey builds its own
    // context and calls the same guard with that host's advertised origin.
    context: async ({ context, hosts }, provide) => {
        const external = await guardExternalRequests(
            context,
            Object.values(hosts).flatMap((host) => [
                host.origin,
                ...(host.lan === undefined ? [] : [host.lan.origin]),
            ]),
        );
        await provide(context);
        expect(
            external,
            `The browser requested an origin outside the E2E service hosts: ${external.join(", ")}`,
        ).toEqual([]);
    },
    hosts: async ({}, provide) => {
        await provide(readHosts());
    },
    journeyFor: async ({ request }, provide) => {
        await provide((origin) => createRunJourney(request, origin));
    },
    workspaceFor: async ({ journeyFor }, provide, testInfo) => {
        const workspaces: Workspace[] = [];
        await provide((origin) => {
            const workspace = createWorkspace(journeyFor(origin));
            workspaces.push(workspace);
            return workspace;
        });
        if (testInfo.status === "passed") {
            for (const workspace of workspaces) {
                await workspace.cleanup();
            }
        }
    },
});
