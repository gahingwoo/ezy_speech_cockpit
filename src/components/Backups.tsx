/* SPDX-License-Identifier: AGPL-3.0-or-later */

import React, { useCallback, useEffect, useState } from "react";
import { Alert, AlertActionCloseButton } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Content } from "@patternfly/react-core/dist/esm/components/Content/index.js";
import { DataList, DataListCell, DataListItem, DataListItemCells, DataListItemRow, DataListAction } from "@patternfly/react-core/dist/esm/components/DataList/index.js";
import { DescriptionList } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { FormSelect, FormSelectOption } from "@patternfly/react-core/dist/esm/components/FormSelect/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";
import { Progress } from "@patternfly/react-core/dist/esm/components/Progress/index.js";
import { Switch } from "@patternfly/react-core/dist/esm/components/Switch/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { Stack, StackItem } from "@patternfly/react-core/dist/esm/layouts/Stack/index.js";
import ArchiveIcon from "@patternfly/react-icons/dist/esm/icons/archive-icon";
import ClockIcon from "@patternfly/react-icons/dist/esm/icons/clock-icon";
import cockpit from "cockpit";

import { _, ezy, ezyJson, ezyLines, type Backups as BackupList } from "../ezyspeech.js";
import { Confirm } from "./Confirm.jsx";
import { Row, plain } from "./Row.jsx";

// When the timer runs: systemd calendar times, and what to call them.
const WHEN = (): [string, string][] => [
    ["Sun 14:00", _("Every Sunday at 14:00, after the service")],
    ["daily 03:00", _("Every day at 03:00")],
    ["Sat 22:00", _("Every Saturday at 22:00")],
];

function when(time: number) {
    return new Date(time * 1000).toLocaleString();
}

/* Backups: on a timer or now, and putting one back. A restore replaces the
 * settings, password and transcripts, so it asks first, and the command backs
 * up what is there before it does. */
export function Backups({ admin, refresh }: { admin: boolean; refresh: () => void }) {
    const [list, setList] = useState<BackupList | null>(null);
    const [unsupported, setUnsupported] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [restoring, setRestoring] = useState<{ file: string; name: string; time: number } | null>(null);
    const [progress, setProgress] = useState<{ pct: number; text: string } | null>(null);

    const load = useCallback(() => {
        ezyJson<BackupList>(["backup", "--list", "--json"])
                .then(l => { setList(l); setUnsupported(false) })
                .catch(() => setUnsupported(true));
    }, []);

    useEffect(() => { load() }, [load]);

    if (unsupported)
        return <Alert variant="info" isInline title={_("Backups here need EzySpeech 4.1.13 or later; update it first.")} />;

    const act = (args: string[], done: (out: string) => string) => {
        setBusy(args[0] + (args[1] ?? ""));
        setMessage(null);
        ezy(args)
                .then(out => setMessage({ ok: true, text: done(out) }))
                .catch((e: Error) => setMessage({ ok: false, text: e.message }))
                .finally(() => { setBusy(null); load() });
    };

    const restore = (file: string, name: string) => {
        setRestoring(null);
        setBusy("restore");
        setMessage(null);
        setProgress({ pct: 0, text: _("Starting") });
        let failed = "";
        ezyLines(["restore", file, "--yes", "--progress"], line => {
            const m = line.match(/^PROGRESS (\d+) (.*)$/);
            if (m) setProgress({ pct: Number(m[1]), text: m[2] });
            else if (line.startsWith("FAILED ")) failed = line.slice(7);
        })
                .then(() => setMessage({ ok: true, text: cockpit.format(_("Restored $0. What was there before is kept as a backup too."), name) }))
                .catch(() => setMessage({ ok: false, text: failed || _("The restore did not complete.") }))
                .finally(() => { setBusy(null); setProgress(null); load(); refresh() });
    };

    const auto = list?.auto;
    const known = WHEN();
    const choices = auto && !known.some(([v]) => v === auto.when) ? [...known, [auto.when, auto.when] as [string, string]] : known;
    const last = list?.backups[0];

    return (
        <Stack hasGutter>
            <StackItem>
                <DescriptionList isHorizontal columnModifier={{ lg: "2Col" }} aria-label={_("Backups")}>
                    <Row icon={plain(<ClockIcon />)} state={auto?.on ? _("On a timer") : _("Off")}
                         detail={cockpit.format(_("Keeps the newest $0, in $1"), auto?.keep ?? "?", list?.dir ?? "")}>
                        {auto?.on ? choices.find(([v]) => v === auto.when)?.[1] : _("Backups are made only when asked for")}
                    </Row>
                    <Row icon={plain(<ArchiveIcon />)} state={_("Latest")}
                         detail={last ? cockpit.format(_("$0, $1"), cockpit.format_bytes(last.size), last.auto ? _("on the timer") : _("by hand")) : undefined}>
                        {last ? when(last.time) : _("None yet")}
                    </Row>
                </DescriptionList>
            </StackItem>

            {progress && <StackItem><Progress value={progress.pct} title={progress.text} /></StackItem>}
            {message &&
                <StackItem>
                    <Alert variant={message.ok ? "success" : "danger"} isInline title={message.text}
                           actionClose={<AlertActionCloseButton onClose={() => setMessage(null)} />} />
                </StackItem>}

            <StackItem>
                <Flex spaceItems={{ default: "spaceItemsMd" }} alignItems={{ default: "alignItemsCenter" }}>
                    <FlexItem>
                        <Button variant="secondary" isDisabled={!admin || !!busy} isLoading={busy === "backup"}
                                onClick={() => act(["backup"], out => cockpit.format(_("Saved $0"), out.trim().replace(/^Saved /, "")))}>
                            {_("Back up now")}
                        </Button>
                    </FlexItem>
                    <FlexItem>
                        <Switch id="ezy-auto-backup" label={_("Back up on a timer")} isChecked={!!auto?.on}
                                isDisabled={!admin || !!busy || !auto?.possible}
                                onChange={(_e, on) => act(["auto-backup", on ? "on" : "off"],
                                                          () => on ? _("Backups on a timer are on.") : _("Backups on a timer are off."))} />
                    </FlexItem>
                    {auto?.on &&
                        <FlexItem>
                            <FormSelect value={auto.when} aria-label={_("When")} isDisabled={!admin || !!busy}
                                        onChange={(_e, v) => act(["auto-backup", "on", "--when", v],
                                                                 () => _("The time is changed."))}>
                                {choices.map(([v, label]) => <FormSelectOption key={v} value={v} label={label} />)}
                            </FormSelect>
                        </FlexItem>}
                </Flex>
            </StackItem>

            {list && list.backups.length > 0 &&
                <StackItem>
                    <DataList aria-label={_("Backups kept")} isCompact>
                        {list.backups.map(b => (
                            <DataListItem key={b.file} aria-labelledby={`ezy-b-${b.name}`}>
                                <DataListItemRow>
                                    <DataListItemCells dataListCells={[
                                        <DataListCell key="when" id={`ezy-b-${b.name}`}>{when(b.time)}</DataListCell>,
                                        <DataListCell key="size">{cockpit.format_bytes(b.size)}</DataListCell>,
                                        <DataListCell key="how">
                                            <Label isCompact>{b.auto ? _("On the timer") : _("By hand")}</Label>
                                        </DataListCell>,
                                    ]} />
                                    <DataListAction id={`ezy-r-${b.name}`} aria-label={_("Restore")}
                                                    aria-labelledby={`ezy-r-${b.name} ezy-b-${b.name}`}>
                                        <Button variant="link" isDanger isDisabled={!admin || !!busy}
                                                onClick={() => setRestoring(b)}>{_("Restore")}</Button>
                                    </DataListAction>
                                </DataListItemRow>
                            </DataListItem>
                        ))}
                    </DataList>
                </StackItem>}

            {restoring &&
                <Confirm isOpen isDanger title={cockpit.format(_("Restore the backup from $0?"), when(restoring.time))}
                         action={_("Restore")} onConfirm={() => restore(restoring.file, restoring.name)}
                         onCancel={() => setRestoring(null)}>
                    <Content component="p">
                        {_("The settings, the admin password and the transcripts there now are replaced by the backup's, and both servers restart. What is there now is backed up first, so this can be undone.")}
                    </Content>
                </Confirm>}
        </Stack>
    );
}
