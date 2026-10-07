/* SPDX-License-Identifier: AGPL-3.0-or-later */

import React, { useCallback, useEffect, useState } from "react";
import { Alert, AlertActionCloseButton } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { CodeBlock, CodeBlockCode } from "@patternfly/react-core/dist/esm/components/CodeBlock/index.js";
import { Content } from "@patternfly/react-core/dist/esm/components/Content/index.js";
import { DescriptionList } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { Progress } from "@patternfly/react-core/dist/esm/components/Progress/index.js";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { Stack, StackItem } from "@patternfly/react-core/dist/esm/layouts/Stack/index.js";
import ArrowCircleUpIcon from "@patternfly/react-icons/dist/esm/icons/arrow-circle-up-icon";
import HistoryIcon from "@patternfly/react-icons/dist/esm/icons/history-icon";
import cockpit from "cockpit";

import { _, ezyJson, ezyLines, type Check, type Status } from "../ezyspeech.js";
import { Confirm } from "./Confirm.jsx";
import { OutLink, Row, info, ok, plain, warn } from "./Row.jsx";

export function Updates({ status, admin, refresh }: { status: Status; admin: boolean; refresh: () => void }) {
    const [check, setCheck] = useState<Check | null>(null);
    const [checking, setChecking] = useState(false);
    const [checkError, setCheckError] = useState<string | null>(null);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState<{ pct: number; text: string } | null>(null);
    const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
    const [lines, setLines] = useState<string[]>([]);
    const [askRollback, setAskRollback] = useState(false);

    const doCheck = useCallback(() => {
        setChecking(true);
        setCheckError(null);
        ezyJson<Check>(["check-update", "--json"])
                .then(setCheck)
                // An answer from before the failure is not an answer now.
                .catch((e: Error) => { setCheck(null); setCheckError(e.message.replace(/^ezyspeech: /, "")) })
                .finally(() => setChecking(false));
    }, []);

    useEffect(() => { doCheck() }, [doCheck]);

    // Runs update or rollback, following the PROGRESS and FAILED lines the
    // command prints for exactly this.
    const run = (args: string[], done: string) => {
        setAskRollback(false);
        setRunning(true);
        setResult(null);
        setLines([]);
        setProgress({ pct: 0, text: _("Starting") });
        let failed = "";
        ezyLines(args, line => {
            const m = line.match(/^PROGRESS (\d+) (.*)$/);
            if (m) setProgress({ pct: Number(m[1]), text: m[2] });
            else if (line.startsWith("FAILED ")) failed = line.slice(7);
            else if (line.trim()) setLines(prev => [...prev.slice(-200), line]);
        })
                .then(() => setResult({ ok: true, text: done }))
                .catch(() => setResult({ ok: false, text: failed || _("It did not complete. The log below says why.") }))
                .finally(() => { setRunning(false); setProgress(null); refresh(); doCheck() });
    };

    const older = status.releases.filter(r => r !== status.version);
    const previous = older[older.length - 1];
    const notes = check?.url && <OutLink href={check.url}>{_("Release notes")}</OutLink>;

    let row;
    if (checking && !check)
        row = <Row icon={<Spinner size="md" isInline />} state={_("Checking")}>{_("Asking GitHub for the latest release")}</Row>;
    else if (checkError)
        row = <Row icon={warn} state={_("Unknown")} detail={checkError}>{_("Could not check for updates")}</Row>;
    else if (check?.update_available)
        row = (
            <Row icon={info(<ArrowCircleUpIcon />)} state={_("Available")}
                 detail={cockpit.format(_("This machine runs $0"), check.installed)}>
                EzySpeech {check.latest} · {notes}
            </Row>
        );
    else if (check)
        row = (
            <Row icon={ok} state={_("Up to date")} detail={_("The latest release on GitHub")}>
                EzySpeech {check.installed} · {notes}
            </Row>
        );

    return (
        <Stack hasGutter>
            <StackItem>
                <DescriptionList isHorizontal columnModifier={{ lg: "2Col" }} aria-label={_("Updates")}>
                    {row}
                    {previous &&
                        <Row icon={plain(<HistoryIcon />)} state={_("Kept")}
                             detail={_("Going back to it is a restart")}>
                            {cockpit.format(_("The release before: $0"), previous)}
                        </Row>}
                </DescriptionList>
            </StackItem>
            {check?.update_available && !running && !result &&
                <StackItem>
                    <Content component="p" className="ezy-detail">
                        {_("The update is checked against its published SHA-256, prepared beside the running release, and switched in with a restart. If it does not come up healthy, the running release is put back.")}
                    </Content>
                </StackItem>}
            {progress && <StackItem><Progress value={progress.pct} title={progress.text} /></StackItem>}
            {result &&
                <StackItem>
                    <Alert variant={result.ok ? "success" : "danger"} isInline title={result.text}
                           actionClose={<AlertActionCloseButton onClose={() => setResult(null)} />} />
                </StackItem>}
            {lines.length > 0 && !running && result && !result.ok &&
                <StackItem>
                    <CodeBlock><CodeBlockCode>{lines.slice(-40).join("\n")}</CodeBlockCode></CodeBlock>
                </StackItem>}
            <StackItem>
                <Flex spaceItems={{ default: "spaceItemsSm" }}>
                    {(check?.update_available || running) &&
                        <FlexItem>
                            <Button variant="primary" isDisabled={!admin || running}
                                    isLoading={running} onClick={() => run(["update", "--yes", "--progress"], _("Updated."))}>
                                {check ? cockpit.format(_("Update to $0"), check.latest) : _("Update")}
                            </Button>
                        </FlexItem>}
                    <FlexItem>
                        <Button variant="secondary" isDisabled={running || checking} onClick={doCheck}>{_("Check again")}</Button>
                    </FlexItem>
                    {previous &&
                        <FlexItem>
                            <Button variant="link" isDisabled={!admin || running} onClick={() => setAskRollback(true)}>
                                {cockpit.format(_("Roll back to $0"), previous)}
                            </Button>
                        </FlexItem>}
                </Flex>
            </StackItem>
            {previous &&
                <Confirm isOpen={askRollback} title={cockpit.format(_("Roll back to $0?"), previous)}
                         action={_("Roll back")}
                         onConfirm={() => run(["rollback"], cockpit.format(_("Back on $0."), previous))}
                         onCancel={() => setAskRollback(false)}>
                    <Content component="p">
                        {cockpit.format(_("$0 is set aside and $1 started in its place. Both servers restart, so listeners lose the stream for a few seconds."),
                                        status.version ?? "?", previous)}
                    </Content>
                </Confirm>}
        </Stack>
    );
}
