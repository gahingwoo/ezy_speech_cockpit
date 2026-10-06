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
import { Card, CardBody, CardHeader, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { ClipboardCopy } from "@patternfly/react-core/dist/esm/components/ClipboardCopy/index.js";
import { CodeBlock, CodeBlockCode } from "@patternfly/react-core/dist/esm/components/CodeBlock/index.js";
import { Content } from "@patternfly/react-core/dist/esm/components/Content/index.js";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { EmptyState, EmptyStateBody } from "@patternfly/react-core/dist/esm/components/EmptyState/index.js";
import { Form, FormGroup, FormHelperText } from "@patternfly/react-core/dist/esm/components/Form/index.js";
import { HelperText, HelperTextItem } from "@patternfly/react-core/dist/esm/components/HelperText/index.js";
import { Icon } from "@patternfly/react-core/dist/esm/components/Icon/index.js";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@patternfly/react-core/dist/esm/components/Modal/index.js";
import { Page, PageSection } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { Progress } from "@patternfly/react-core/dist/esm/components/Progress/index.js";
import { Radio } from "@patternfly/react-core/dist/esm/components/Radio/index.js";
import { SearchInput } from "@patternfly/react-core/dist/esm/components/SearchInput/index.js";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner/index.js";
import { Switch } from "@patternfly/react-core/dist/esm/components/Switch/index.js";
import { Tab, Tabs, TabTitleText } from "@patternfly/react-core/dist/esm/components/Tabs/index.js";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";
import { Toolbar, ToolbarContent, ToolbarItem } from "@patternfly/react-core/dist/esm/components/Toolbar/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { Stack, StackItem } from "@patternfly/react-core/dist/esm/layouts/Stack/index.js";
import ArchiveIcon from "@patternfly/react-icons/dist/esm/icons/archive-icon";
import ArrowCircleUpIcon from "@patternfly/react-icons/dist/esm/icons/arrow-circle-up-icon";
import CheckCircleIcon from "@patternfly/react-icons/dist/esm/icons/check-circle-icon";
import ExclamationCircleIcon from "@patternfly/react-icons/dist/esm/icons/exclamation-circle-icon";
import ExclamationTriangleIcon from "@patternfly/react-icons/dist/esm/icons/exclamation-triangle-icon";
import HistoryIcon from "@patternfly/react-icons/dist/esm/icons/history-icon";
import LockIcon from "@patternfly/react-icons/dist/esm/icons/lock-icon";
import ServerIcon from "@patternfly/react-icons/dist/esm/icons/server-icon";
import ExternalLinkAltIcon from "@patternfly/react-icons/dist/esm/icons/external-link-alt-icon";
import { superuser } from "superuser.js";
import cockpit from "cockpit";

const _ = cockpit.gettext;
const CMD = "ezyspeech";
// Administrative access runs commands with sudo's PATH, which on Red Hat-like
// systems leaves out /usr/local/bin, where the installer puts the command.
const ENV = ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"];
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
    addresses?: { listener: string | null; console: string | null; https: boolean; console_https: boolean };
    services?: Record<string, string>;
    containers?: Record<string, string>;
};

type Check = { installed: string; latest: string; update_available: boolean; notes: string; url: string };

/** Run `ezyspeech args...` (as root where it may) and parse its JSON. */
function ezyJson<T>(args: string[]): Promise<T> {
    return new Promise((resolve, reject) => {
        cockpit.spawn([CMD, ...args], { environ: ENV, superuser: "try", err: "message" })
                .then((out: string) => {
                    try { resolve(JSON.parse(out)) } catch (e) { reject(new Error(out || String(e))) }
                })
                .catch((e: { message?: string; problem?: string }) => reject(new Error(e.message || e.problem || String(e))));
    });
}

/** Run `ezyspeech args...` as root; resolves with what it printed. */
function ezy(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        cockpit.spawn([CMD, ...args], { environ: ENV, superuser: "require", err: "out" })
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

/* Where a server can be opened. Its public address when one is configured;
 * otherwise this machine's port, linked only when Cockpit itself was opened
 * by an address that reaches the machine (an IP or a local name). Through a
 * tunnel or proxy, "cockpit.example.org:1915" would lead nowhere. */
function Address({ url, port, https }: { url: string | null | undefined; port: number; https: boolean }) {
    if (url)
        return <a href={url} target="_blank" rel="noopener noreferrer">{url.replace(/^https?:\/\//, "")} <ExternalLinkAltIcon /></a>;
    const host = window.location.hostname;
    const direct = /^[\d.]+$|:|^localhost$|\.local$|^[^.]+$/.test(host);
    if (!direct)
        return <>{cockpit.format(_("Port $0 on this machine"), port)}</>;
    const target = `${https ? "https" : "http"}://${host.includes(":") ? `[${host}]` : host}:${port}`;
    return <a href={target} target="_blank" rel="noopener noreferrer">{host}:{port} <ExternalLinkAltIcon /></a>;
}

/* One line of status, laid out as PatternFly's status card does it: an icon
 * and a word for the state on the left, what it is about and a detail on the
 * right. */
function Row({ icon, state, children, detail }: {
    icon: React.ReactNode; state: string; children: React.ReactNode; detail?: React.ReactNode
}) {
    return (
        <DescriptionListGroup>
            <DescriptionListTerm>
                <Flex spaceItems={{ default: "spaceItemsSm" }} alignItems={{ default: "alignItemsCenter" }} flexWrap={{ default: "nowrap" }}>
                    <FlexItem>{icon}</FlexItem>
                    <FlexItem><Title headingLevel="h3" size="md">{state}</Title></FlexItem>
                </Flex>
            </DescriptionListTerm>
            <DescriptionListDescription>
                <div>{children}</div>
                {detail && <div className="ezy-detail">{detail}</div>}
            </DescriptionListDescription>
        </DescriptionListGroup>
    );
}

const ok = <Icon status="success"><CheckCircleIcon /></Icon>;
const bad = <Icon status="danger"><ExclamationCircleIcon /></Icon>;
const warn = <Icon status="warning"><ExclamationTriangleIcon /></Icon>;
const info = (icon: React.ReactNode) => <Icon status="info">{icon}</Icon>;
const plain = (icon: React.ReactNode) => <Icon>{icon}</Icon>;

/* ── services ────────────────────────────────────────────────────────────── */

function Services({ status }: { status: Status }) {
    const h = status.health;
    const a = status.addresses;
    const listening = h.listeners !== null && h.listeners !== undefined
        ? cockpit.format(_("Port $0, $1 listening now"), h.port, h.listeners)
        : cockpit.format(_("Port $0"), h.port);

    return (
        <DescriptionList isHorizontal columnModifier={{ lg: "2Col" }} aria-label={_("Services")}>
            <Row icon={h.listener ? ok : bad} state={h.listener ? _("Running") : _("Not answering")}
                 detail={listening}>
                {_("Listener page")}: <Address url={a?.listener} port={h.port} https={!!a?.https} />
            </Row>
            <Row icon={h.console ? ok : bad} state={h.console ? _("Running") : _("Not answering")}
                 detail={cockpit.format(_("Port $0"), h.admin_port)}>
                {_("Operator's console")}: <Address url={a?.console} port={h.admin_port} https={!!a?.console_https} />
            </Row>
            <Row icon={plain(<ServerIcon />)} state={status.mode === "docker" ? _("Docker") : _("Native")}
                 detail={cockpit.format(_("Releases kept: $0"), status.releases.join(", "))}>
                {status.home}
            </Row>
        </DescriptionList>
    );
}

function ServiceActions({ status, admin, refresh }: { status: Status; admin: boolean; refresh: () => void }) {
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const act = (verb: string) => {
        setBusy(verb);
        setError(null);
        ezy([verb]).catch((e: Error) => setError(e.message))
                .finally(() => { setBusy(null); refresh() });
    };

    return (
        <>
            <Flex spaceItems={{ default: "spaceItemsSm" }}>
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
            {error &&
                <Alert variant="danger" isInline title={_("That did not work")}
                       actionClose={<AlertActionCloseButton onClose={() => setError(null)} />}>{error}</Alert>}
        </>
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
        const proc = cockpit.spawn([CMD, ...args], { environ: ENV, superuser: "require", err: "out" });
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
    const previous = older[older.length - 1];
    const notes = check?.url &&
        <a href={check.url} target="_blank" rel="noopener noreferrer">{_("Release notes")} <ExternalLinkAltIcon /></a>;

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
                            <Button variant="link" isDisabled={!admin || running}
                                    onClick={() => run(["rollback"], cockpit.format(_("Back on $0."), previous))}>
                                {cockpit.format(_("Roll back to $0"), previous)}
                            </Button>
                        </FlexItem>}
                </Flex>
            </StackItem>
        </Stack>
    );
}

/* ── the admin password and backups ──────────────────────────────────────── */

function Upkeep({ admin }: { admin: boolean }) {
    const [confirm, setConfirm] = useState(false);
    const [password, setPassword] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    const [own, setOwn] = useState(false);
    const [typed, setTyped] = useState("");
    const [again, setAgain] = useState("");
    const typedOk = typed.length >= 8 && typed === again;

    const ask = () => { setOwn(false); setTyped(""); setAgain(""); setConfirm(true) };

    const newPassword = () => {
        setConfirm(false);
        setBusy("password");
        if (own) {
            // Through standard input, so it never appears in a process list.
            const proc = cockpit.spawn([CMD, "password", "--stdin", "--json"],
                                       { environ: ENV, superuser: "require", err: "message" });
            proc.input(typed + "\n");
            proc.then(() => setMessage({ ok: true, text: _("The new admin password is set; the servers restarted.") }))
                    .catch((e: { message?: string }) => setMessage({ ok: false, text: e.message || String(e) }))
                    .finally(() => { setBusy(null); setTyped(""); setAgain("") });
        } else {
            ezyJson<{ password: string }>(["password", "--generate", "--json"])
                    .then(r => setPassword(r.password))
                    .catch((e: Error) => setMessage({ ok: false, text: e.message }))
                    .finally(() => setBusy(null));
        }
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
        <Stack hasGutter>
            <StackItem>
                <DescriptionList isHorizontal columnModifier={{ lg: "2Col" }} aria-label={_("Password and backups")}>
                    <Row icon={plain(<LockIcon />)} state={_("Hashed")}
                         detail={_("A new one replaces it, and both servers restart")}>
                        {_("The admin password is kept only as a hash, so it cannot be shown")}
                    </Row>
                    <Row icon={plain(<ArchiveIcon />)} state={_("Backups")}
                         detail={_("The settings, the password hash and every transcript, as one file")}>
                        /var/backups
                    </Row>
                </DescriptionList>
            </StackItem>
            {message &&
                <StackItem>
                    <Alert variant={message.ok ? "success" : "danger"} isInline title={message.text}
                           actionClose={<AlertActionCloseButton onClose={() => setMessage(null)} />} />
                </StackItem>}
            <StackItem>
                <Flex spaceItems={{ default: "spaceItemsSm" }}>
                    <FlexItem>
                        <Button variant="secondary" isDisabled={!admin || !!busy} isLoading={busy === "password"}
                                onClick={ask}>{_("Set a new admin password")}</Button>
                    </FlexItem>
                    <FlexItem>
                        <Button variant="secondary" isDisabled={!admin || !!busy} isLoading={busy === "backup"}
                                onClick={backup}>{_("Back up now")}</Button>
                    </FlexItem>
                </Flex>
            </StackItem>

            <Modal variant="small" isOpen={confirm} onClose={() => setConfirm(false)} aria-labelledby="ezy-pw-title">
                <ModalHeader title={_("Set a new admin password?")} labelId="ezy-pw-title" />
                <ModalBody>
                    <Stack hasGutter>
                        <StackItem>
                            <Content component="p">{_("The old one stops working at once, and anyone signed in to the console has to sign in again.")}</Content>
                        </StackItem>
                        <StackItem>
                            <Radio id="ezy-pw-make" name="ezy-pw" label={_("Make a strong one for me")}
                                   isChecked={!own} onChange={() => setOwn(false)} />
                            <Radio id="ezy-pw-own" name="ezy-pw" label={_("I will type it")}
                                   isChecked={own} onChange={() => setOwn(true)} />
                        </StackItem>
                        {own &&
                            <StackItem>
                                <Form onSubmit={e => { e.preventDefault(); if (typedOk) newPassword() }}>
                                    <FormGroup label={_("New password")} fieldId="ezy-pw-1">
                                        <TextInput id="ezy-pw-1" type="password" autoComplete="new-password"
                                                   value={typed} onChange={(_e, v) => setTyped(v)} />
                                        <FormHelperText>
                                            <HelperText>
                                                <HelperTextItem variant={typed && typed.length < 8 ? "error" : "default"}>
                                                    {_("At least 8 characters")}
                                                </HelperTextItem>
                                            </HelperText>
                                        </FormHelperText>
                                    </FormGroup>
                                    <FormGroup label={_("Again")} fieldId="ezy-pw-2">
                                        <TextInput id="ezy-pw-2" type="password" autoComplete="new-password"
                                                   value={again} onChange={(_e, v) => setAgain(v)}
                                                   validated={again && again !== typed ? "error" : "default"} />
                                        {again && again !== typed &&
                                            <FormHelperText>
                                                <HelperText><HelperTextItem variant="error">{_("They do not match")}</HelperTextItem></HelperText>
                                            </FormHelperText>}
                                    </FormGroup>
                                </Form>
                            </StackItem>}
                    </Stack>
                </ModalBody>
                <ModalFooter>
                    <Button variant="primary" isDisabled={own && !typedOk} onClick={newPassword}>
                        {own ? _("Set this password") : _("Make a new password")}
                    </Button>
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
        </Stack>
    );
}

/* ── the card that holds them ────────────────────────────────────────────── */

function Main({ status, admin, refresh }: { status: Status; admin: boolean; refresh: () => void }) {
    const [tab, setTab] = useState<string | number>("services");
    const tabs: [string, string][] = [["services", _("Services")], ["updates", _("Updates")], ["upkeep", _("Password and backups")]];

    return (
        <Card>
            <CardHeader actions={{ actions: <ServiceActions status={status} admin={admin} refresh={refresh} />, hasNoOffset: true }}>
                <CardTitle>
                    <Title headingLevel="h2" size="lg">
                        EzySpeech {status.version ?? "?"}
                    </Title>
                </CardTitle>
            </CardHeader>
            <CardBody>
                <Tabs isFilled activeKey={tab} onSelect={(_e, k) => setTab(k)} aria-label={_("EzySpeech")}>
                    {tabs.map(([key, title]) => <Tab key={key} eventKey={key} title={<TabTitleText>{title}</TabTitleText>} />)}
                </Tabs>
            </CardBody>
            <CardBody>
                {/* All three stay mounted, so an update keeps running on another tab. */}
                <div hidden={tab !== "services"}><Services status={status} /></div>
                <div hidden={tab !== "updates"}><Updates status={status} admin={admin} refresh={refresh} /></div>
                <div hidden={tab !== "upkeep"}><Upkeep admin={admin} /></div>
            </CardBody>
        </Card>
    );
}

/* ── the log ─────────────────────────────────────────────────────────────── */

function Logs() {
    const [lines, setLines] = useState<string[]>([]);
    const [follow, setFollow] = useState(false);
    const [filter, setFilter] = useState("");
    const [requests, setRequests] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const box = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setLines([]);
        setError(null);
        const p = cockpit.spawn([CMD, "logs", "-n", "300", ...(follow ? ["-f"] : [])], { environ: ENV, superuser: "try", err: "out" });
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

    // Every page view and poll is a line of the access log; they bury the rest.
    const request = /"(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) \S+ HTTP\/[\d.]+" \d{3}|\(\d+\) accepted \(|wsgi starting up/;
    const shown = lines.filter(l => (requests || !request.test(l)) &&
                                    (!filter || l.toLowerCase().includes(filter.toLowerCase())));

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
                            <Switch id="ezy-requests" label={_("Web requests")} isChecked={requests} onChange={(_e, v) => setRequests(v)} />
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
            <Stack hasGutter>
                {!admin &&
                    <StackItem>
                        <Alert variant="info" isInline title={_("Turn on administrative access to update, restart or change the password.")} />
                    </StackItem>}
                <StackItem><Main status={status} admin={admin} refresh={refresh} /></StackItem>
                <StackItem><Logs /></StackItem>
            </Stack>
        );
    }

    return (
        <Page className="ct-page-fill" isContentFilled>
            <PageSection>{body}</PageSection>
        </Page>
    );
};
