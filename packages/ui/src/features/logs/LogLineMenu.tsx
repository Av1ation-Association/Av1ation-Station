import type { ReactNode } from "react";

import { Menu, MenuContent, MenuItem, MenuTrigger } from "../../shared/Menu";
import { lineText, type LogMenu } from "./log-format";

export function LogLineMenu({
    children,
    menu,
    runId,
    running,
    onClose,
    onCopy,
    onDelete,
}: {
    /** The log viewport; a right-click or long press on a row opens the menu. */
    children: ReactNode;
    menu: LogMenu | null;
    runId: string;
    running: boolean;
    onClose: () => void;
    onCopy: (text: string, what: string) => void | Promise<void>;
    onDelete: () => void;
}) {
    return (
        <Menu
            mode="context"
            open={menu !== null}
            onOpenChange={(open) => {
                if (!open) {
                    onClose();
                }
            }}
        >
            <MenuTrigger asChild>
                <div className="contents">{children}</div>
            </MenuTrigger>
            {menu === null ? null : (
                <MenuContent className="w-[178px]" aria-label="Log line actions">
                    <MenuItem onSelect={() => void onCopy(menu.record.message, "The message")}>
                        Copy message
                    </MenuItem>
                    <MenuItem onSelect={() => void onCopy(lineText(menu.record), "The line")}>
                        Copy line
                    </MenuItem>
                    <MenuItem onSelect={() => void onCopy(runId, "The run id")}>
                        Copy run id
                    </MenuItem>
                    <MenuItem
                        disabled={running}
                        title={
                            running ? "This run is still writing its log." : "Delete this run's log"
                        }
                        onSelect={onDelete}
                    >
                        Delete log
                    </MenuItem>
                </MenuContent>
            )}
        </Menu>
    );
}
