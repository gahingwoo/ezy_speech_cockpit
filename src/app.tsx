/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * EzySpeech in Cockpit: status, updates, the admin password, backups and the
 * log, for a native install or a Docker one alike.
 *
 * Everything goes through the ezyspeech command on the host (`ezyspeech
 * status --json`, `ezyspeech update --progress`, ...), the same one the
 * installer and the terminal use, so this page has no idea of its own how
 * EzySpeech is installed and cannot disagree with them about it.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertActionCloseButton } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { ClipboardCopy } from "@patternfly/react-core/dist/esm/components/ClipboardCopy/index.js";
import { CodeBlock, CodeBlockCode } from "@patternfly/react-core/dist/esm/components/CodeBlock/index.js";
import { Content } from "@patternfly/react-core/dist/esm/components/Content/index.js";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { EmptyState, EmptyStateBody } from "@patternfly/react-core/dist/esm/components/EmptyState/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@patternfly/react-core/dist/esm/components/Modal/index.js";
import { Page, PageSection } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { Progress } from "@patternfly/react-core/dist/esm/components/Progress/index.js";
import { SearchInput } from "@patternfly/react-core/dist/esm/components/SearchInput/index.js";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner/index.js";
import { Switch } from "@patternfly/react-core/dist/esm/components/Switch/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";
import { Toolbar, ToolbarContent, ToolbarItem } from "@patternfly/react-core/dist/esm/components/Toolbar/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { Grid, GridItem } from "@patternfly/react-core/dist/esm/layouts/Grid/index.js";
import { Stack, StackItem } from "@patternfly/react-core/dist/esm/layouts/Stack/index.js";
import ExternalLinkAltIcon from "@patternfly/react-icons/dist/esm/icons/external-link-alt-icon";
import { superuser } from "superuser.js";
import cockpit from "cockpit";

const _ = cockpit.gettext;
const CMD = "ezyspeech";
const POLL_MS = 10000;

/* ── the command ─────────────────────────────────────────────────────────── */

type Status = {
    mode: "native" | "docker";
    home: string;
    version: string | null;
    releases: string[];
    running: boolean;
    health: { listener: boolean; console: boolean; version: string | null;
              port: number; admin_port: number; listeners: number | null };
    services?: Record<string, string>;
    containers?: Record<string, string>;
};

type Check = { installed: string; latest: string; update_available: boolean; notes: string; url: string };

/** Run `ezyspeech args...` (as root where it may) and parse its JSON. */
function ezyJson<T>(args: string[]): Promise<T> {
    return new Promise((resolve, reject) => {
        cockpit.spawn([CMD, ...args], { superuser: "try", err: "message" })
                .then((out: string) => {
                    try { resolve(JSON.parse(out)) } catch (e) { reject(new Error(out || String(e))) }
                })
                .catch((e: { message?: string; problem?: string }) => reject(new Error(e.message || e.problem || String(e))));
    });
}

/** Run `ezyspeech args...` as root; resolves with what it printed. */
function ezy(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        cockpit.spawn([CMD, ...args], { superuser: "require", err: "out" })
                .then((out: string) => resolve(out))
                .catch((e: { message?: string }, out?: string) => reject(new Error(out || e.message || String(e))));
    });
}

function useAdmin(): boolean {
    const [allowed, setAllowed] = useState<boolean>(superuser.allowed === true);
    useEffect(() => {
        const changed = () => setAllowed(superuser.allowed === true);
        superuser.addEventListener("changed", changed);
        return () => superuser.removeEventListener("changed", changed);
    }, []);
    return allowed;
}

/* ── status ──────────────────────────────────────────────────────────────── */

function useStatus() {
    const [status, setStatus] = useState<Status | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [missing, setMissing] = useState(false);

    const refresh = useCallback(() => {
        ezyJson<Status>(["status", "--json"])
                .then(s => { setStatus(s); setError(null); setMissing(false) })
                .catch((e: Error) => {
                    if (/not found|No such file|not installed/i.test(e.message)) setMissing(true);
                    else setError(e.message);
                });
    }, []);

    useEffect(() => {
        refresh();
        const timer = window.setInterval(refresh, POLL_MS);
        return () => window.clearInterval(timer);
    }, [refresh]);

    return { status, error, missing, refresh };
}

function UpLabel({ up, what }: { up: boolean; what: string }) {
    return <Label color={up ? "green" : "red"}>{what}: {up ? _("running") : _("not answering")}</Label>;
}

function Overview({ status, admin, refresh }: { status: Status; admin: boolean; refresh: () => void }) {
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const host = window.location.hostname;
    const h = status.health;

    const act = (verb: string) => {
        setBusy(verb);
        setError(null);
        ezy([verb]).catch((e: Error) => setError(e.message))
                .finally(() => { setBusy(null); refresh() });
    };

    return (
        <Card isFullHeight>
            <CardHeader>
                <CardTitle>
                    <Title headingLevel="h2">
                        EzySpeech {status.version ?? "?"}{" "}
                        <Label isCompact>{status.mode === "docker" ? _("Docker") : _("Native")}</Label>
                    </Title>
                </CardTitle>
            </CardHeader>
            <CardBody>
                <Stack hasGutter>
                    <StackItem>
                        <Flex>
                            <FlexItem><UpLabel up={h.listener} what={_("Listener page")} /></FlexItem>
                            <FlexItem><UpLabel up={h.console} what={_("Console")} /></FlexItem>
                            {h.listeners !== null && h.listeners !== undefined &&
                                <FlexItem><Label color="blue">{cockpit.format(_("$0 listening"), h.listeners)}</Label></FlexItem>}
                        </Flex>
                    </StackItem>
                    <StackItem>
                        <DescriptionList isCompact>
                            <DescriptionListGroup>
                                <DescriptionListTerm>{_("Listener page")}</DescriptionListTerm>
                                <DescriptionListDescription>
                                    <a href={`http://${host}:${h.port}`} target="_blank" rel="noopener noreferrer">
                                        {host}:{h.port} <ExternalLinkAltIcon />
                                    </a>
                                </DescriptionListDescription>
                            </DescriptionListGroup>
                            <DescriptionListGroup>
                                <DescriptionListTerm>{_("Operator's console")}</DescriptionListTerm>
                                <DescriptionListDescription>
                                    <a href={`http://${host}:${h.admin_port}`} target="_blank" rel="noopener noreferrer">
                                        {host}:{h.admin_port} <ExternalLinkAltIcon />
                                    </a>
                                </DescriptionListDescription>
                            </DescriptionListGroup>
                            <DescriptionListGroup>
                                <DescriptionListTerm>{_("Installed in")}</DescriptionListTerm>
                                <DescriptionListDescription>{status.home}</DescriptionListDescription>
                            </DescriptionListGroup>
                            <DescriptionListGroup>
                                <DescriptionListTerm>{_("Releases kept")}</DescriptionListTerm>
                                <DescriptionListDescription>{status.releases.join(", ")}</DescriptionListDescription>
                            </DescriptionListGroup>
                        </DescriptionList>
                    </StackItem>
                    {error && <StackItem><Alert variant="danger" isInline title={_("That did not work")}>{error}</Alert></StackItem>}
                </Stack>
            </CardBody>
            <CardFooter>
                <Flex>
                    {status.running
                        ? <>
                            <FlexItem>
                                <Button variant="secondary" isDisabled={!admin || !!busy} isLoading={busy === "restart"}
                                        onClick={() => act("restart")}>{_("Restart")}</Button>
                            </FlexItem>
                            <FlexItem>
                                <Button variant="secondary" isDanger isDisabled={!admin || !!busy} isLoading={busy === "stop"}
                                        onClick={() => act("stop")}>{_("Stop")}</Button>
                            </FlexItem>
                        </>
                        : <FlexItem>
                            <Button variant="primary" isDisabled={!admin || !!busy} isLoading={busy === "start"}
                                    onClick={() => act("start")}>{_("Start")}</Button>
                        </FlexItem>}
                </Flex>
            </CardFooter>
        </Card>
    );
}

/* ── updates ─────────────────────────────────────────────────────────────── */

function Updates({ status, admin, refresh }: { status: Status; admin: boolean; refresh: () => void }) {
    const [check, setCheck] = useState<Check | null>(null);
    const [checking, setChecking] = useState(false);
    const [checkError, setCheckError] = useState<string | null>(null);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState<{ pct: number; text: string } | null>(null);
    const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
    const [lines, setLines] = useState<string[]>([]);

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

    const run = (args: string[], done: string) => {
        setRunning(true);
        setResult(null);
        setLines([]);
        setProgress({ pct: 0, text: _("Starting") });
        const proc = cockpit.spawn([CMD, ...args], { superuser: "require", err: "out" });
        let buffer = "";
        let failed = "";
        proc.stream((chunk: string) => {
            buffer += chunk;
            const parts = buffer.split("\n");
            buffer = parts.pop() ?? "";
            for (const line of parts) {
                const m = line.match(/^PROGRESS (\d+) (.*)$/);
                if (m) setProgress({ pct: Number(m[1]), text: m[2] });
                else if (line.startsWith("FAILED ")) failed = line.slice(7);
                else if (line.trim()) setLines(prev => [...prev.slice(-200), line]);
            }
        });
        proc.then(() => setResult({ ok: true, text: done }))
                .catch(() => setResult({ ok: false, text: failed || _("It did not complete. The log below says why.") }))
                .finally(() => { setRunning(false); setProgress(null); refresh(); doCheck() });
    };

    const older = status.releases.filter(r => r !== status.version);

    return (
        <Card isFullHeight>
            <CardHeader><CardTitle><Title headingLevel="h2">{_("Updates")}</Title></CardTitle></CardHeader>
            <CardBody>
                <Stack hasGutter>
                    {checking && <StackItem><Spinner size="md" /> {_("Checking GitHub for the latest release...")}</StackItem>}
                    {checkError && <StackItem><Alert variant="warning" isInline title={_("Could not check for updates")}>{checkError}</Alert></StackItem>}
                    {check && !check.update_available &&
                        <StackItem><Content component="p">{cockpit.format(_("Up to date: $0 is the latest release."), check.installed)}</Content></StackItem>}
                    {check && check.update_available &&
                        <StackItem>
                            <Alert variant="info" isInline title={cockpit.format(_("EzySpeech $0 is available (this is $1)"), check.latest, check.installed)}>
                                <Content component="p">{_("The update is checked against its published SHA-256, prepared beside the running release, and switched in with a restart. If it does not come up healthy, the running release is put back.")}</Content>
                                {check.url && <a href={check.url} target="_blank" rel="noopener noreferrer">{_("Release notes")} <ExternalLinkAltIcon /></a>}
                            </Alert>
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
                </Stack>
            </CardBody>
            <CardFooter>
                <Flex>
                    <FlexItem>
                        <Button variant="primary" isDisabled={!admin || running || !check?.update_available}
                                isLoading={running} onClick={() => run(["update", "--yes", "--progress"], _("Updated."))}>
                            {check?.update_available ? cockpit.format(_("Update to $0"), check.latest) : _("Update")}
                        </Button>
                    </FlexItem>
                    <FlexItem>
                        <Button variant="secondary" isDisabled={running || checking} onClick={doCheck}>{_("Check again")}</Button>
                    </FlexItem>
                    {older.length > 0 &&
                        <FlexItem>
                            <Button variant="link" isDisabled={!admin || running}
                                    onClick={() => run(["rollback"], cockpit.format(_("Back on $0."), older[older.length - 1]))}>
                                {cockpit.format(_("Roll back to $0"), older[older.length - 1])}
                            </Button>
                        </FlexItem>}
                </Flex>
            </CardFooter>
        </Card>
    );
}

/* ── the admin password and backups ──────────────────────────────────────── */

function Upkeep({ admin }: { admin: boolean }) {
    const [confirm, setConfirm] = useState(false);
    const [password, setPassword] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    const newPassword = () => {
        setConfirm(false);
        setBusy("password");
        ezyJson<{ password: string }>(["password", "--generate", "--json"])
                .then(r => setPassword(r.password))
                .catch((e: Error) => setMessage({ ok: false, text: e.message }))
                .finally(() => setBusy(null));
    };

    const backup = () => {
        setBusy("backup");
        const file = `/var/backups/ezyspeech-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.tar.gz`;
        ezy(["backup", file])
                .then(() => setMessage({ ok: true, text: cockpit.format(_("Saved $0"), file) }))
                .catch((e: Error) => setMessage({ ok: false, text: e.message }))
                .finally(() => setBusy(null));
    };

    return (
        <Card isFullHeight>
            <CardHeader><CardTitle><Title headingLevel="h2">{_("Password and backups")}</Title></CardTitle></CardHeader>
            <CardBody>
                <Stack hasGutter>
                    <StackItem>
                        <Content component="p">
                            {_("The admin password is kept only as a hash, so it cannot be shown. A new one replaces it, and both servers restart.")}
                        </Content>
                    </StackItem>
                    <StackItem>
                        <Content component="p">
                            {_("A backup is the settings, the password hash and every transcript, as one file in /var/backups.")}
                        </Content>
                    </StackItem>
                    {message && <StackItem><Alert variant={message.ok ? "success" : "danger"} isInline title={message.text} /></StackItem>}
                </Stack>
            </CardBody>
            <CardFooter>
                <Flex>
                    <FlexItem>
                        <Button variant="secondary" isDisabled={!admin || !!busy} isLoading={busy === "password"}
                                onClick={() => setConfirm(true)}>{_("Set a new admin password")}</Button>
                    </FlexItem>
                    <FlexItem>
                        <Button variant="secondary" isDisabled={!admin || !!busy} isLoading={busy === "backup"}
                                onClick={backup}>{_("Back up now")}</Button>
                    </FlexItem>
                </Flex>
            </CardFooter>

            <Modal variant="small" isOpen={confirm} onClose={() => setConfirm(false)} aria-labelledby="ezy-pw-title">
                <ModalHeader title={_("Set a new admin password?")} labelId="ezy-pw-title" />
                <ModalBody>{_("The old one stops working at once, and anyone signed in to the console has to sign in again.")}</ModalBody>
                <ModalFooter>
                    <Button variant="primary" onClick={newPassword}>{_("Make a new password")}</Button>
                    <Button variant="link" onClick={() => setConfirm(false)}>{_("Cancel")}</Button>
                </ModalFooter>
            </Modal>
            <Modal variant="small" isOpen={!!password} onClose={() => setPassword(null)} aria-labelledby="ezy-pw-new">
                <ModalHeader title={_("The new admin password")} labelId="ezy-pw-new" />
                <ModalBody>
                    <Stack hasGutter>
                        <StackItem><ClipboardCopy isReadOnly hoverTip={_("Copy")} clickTip={_("Copied")}>{password ?? ""}</ClipboardCopy></StackItem>
                        <StackItem><Content component="p">{_("Write it down: it is not shown again.")}</Content></StackItem>
                    </Stack>
                </ModalBody>
                <ModalFooter><Button variant="primary" onClick={() => setPassword(null)}>{_("Done")}</Button></ModalFooter>
            </Modal>
        </Card>
    );
}

/* ── the log ─────────────────────────────────────────────────────────────── */

function Logs() {
    const [lines, setLines] = useState<string[]>([]);
    const [follow, setFollow] = useState(false);
    const [filter, setFilter] = useState("");
    const [error, setError] = useState<string | null>(null);
    const box = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setLines([]);
        setError(null);
        const p = cockpit.spawn([CMD, "logs", "-n", "300", ...(follow ? ["-f"] : [])], { superuser: "try", err: "out" });
        let buffer = "";
        p.stream((chunk: string) => {
            buffer += chunk;
            const parts = buffer.split("\n");
            buffer = parts.pop() ?? "";
            if (parts.length) setLines(prev => [...prev, ...parts].slice(-1000));
        });
        p.catch((e: { message?: string; problem?: string }) => {
            if (e.problem !== "cancelled") setError(e.message || String(e));
        });
        return () => p.close("cancelled");
    }, [follow]);

    useEffect(() => {
        if (follow && box.current) box.current.scrollTop = box.current.scrollHeight;
    }, [lines, follow]);

    const shown = filter ? lines.filter(l => l.toLowerCase().includes(filter.toLowerCase())) : lines;

    return (
        <Card>
            <CardHeader><CardTitle><Title headingLevel="h2">{_("Log")}</Title></CardTitle></CardHeader>
            <CardBody>
                <Toolbar>
                    <ToolbarContent>
                        <ToolbarItem>
                            <SearchInput placeholder={_("Filter")} value={filter}
                                         onChange={(_e, v) => setFilter(v)} onClear={() => setFilter("")} />
                        </ToolbarItem>
                        <ToolbarItem>
                            <Switch id="ezy-follow" label={_("Follow")} isChecked={follow} onChange={(_e, v) => setFollow(v)} />
                        </ToolbarItem>
                    </ToolbarContent>
                </Toolbar>
                {error && <Alert variant="danger" isInline title={_("Could not read the log")}>{error}</Alert>}
                {!error && shown.length === 0
                    ? <EmptyState><EmptyStateBody>{filter ? _("No lines match.") : _("Nothing logged yet.")}</EmptyStateBody></EmptyState>
                    : <div ref={box} className="ezy-log"><pre>{shown.join("\n")}</pre></div>}
            </CardBody>
        </Card>
    );
}

/* ── the page ────────────────────────────────────────────────────────────── */

export const Application = () => {
    const admin = useAdmin();
    const { status, error, missing, refresh } = useStatus();

    let body: React.ReactNode;
    if (missing) {
        body = (
            <EmptyState titleText={_("EzySpeech is not installed on this machine")} headingLevel="h2">
                <EmptyStateBody>
                    <Content component="p">{_("Install it from a terminal; this page manages it afterwards.")}</Content>
                    <ClipboardCopy isReadOnly>
                        curl -fsSL https://github.com/gahingwoo/ezy_speech_translate/releases/latest/download/install.sh | sudo bash
                    </ClipboardCopy>
                </EmptyStateBody>
            </EmptyState>
        );
    } else if (!status) {
        body = error
            ? <Alert variant="danger" isInline title={_("Could not read EzySpeech's status")}>{error}</Alert>
            : <EmptyState titleText={_("Loading")} headingLevel="h2" icon={Spinner} />;
    } else {
        body = (
            <Grid hasGutter>
                {!admin &&
                    <GridItem span={12}>
                        <Alert variant="info" isInline title={_("Turn on administrative access to update, restart or change the password.")} />
                    </GridItem>}
                <GridItem lg={4}><Overview status={status} admin={admin} refresh={refresh} /></GridItem>
                <GridItem lg={4}><Updates status={status} admin={admin} refresh={refresh} /></GridItem>
                <GridItem lg={4}><Upkeep admin={admin} /></GridItem>
                <GridItem span={12}><Logs /></GridItem>
            </Grid>
        );
    }

    return (
        <Page isContentFilled>
            <PageSection>{body}</PageSection>
        </Page>
    );
};
