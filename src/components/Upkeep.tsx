/* SPDX-License-Identifier: AGPL-3.0-or-later */

import React, { useState } from "react";
import { Alert, AlertActionCloseButton } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { ClipboardCopy } from "@patternfly/react-core/dist/esm/components/ClipboardCopy/index.js";
import { Content } from "@patternfly/react-core/dist/esm/components/Content/index.js";
import { DescriptionList } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { Form, FormGroup, FormHelperText } from "@patternfly/react-core/dist/esm/components/Form/index.js";
import { HelperText, HelperTextItem } from "@patternfly/react-core/dist/esm/components/HelperText/index.js";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@patternfly/react-core/dist/esm/components/Modal/index.js";
import { Radio } from "@patternfly/react-core/dist/esm/components/Radio/index.js";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { Stack, StackItem } from "@patternfly/react-core/dist/esm/layouts/Stack/index.js";
import ArchiveIcon from "@patternfly/react-icons/dist/esm/icons/archive-icon";
import LockIcon from "@patternfly/react-icons/dist/esm/icons/lock-icon";
import cockpit from "cockpit";

import { _, CMD, ENV, ezy, ezyJson } from "../ezyspeech.js";
import { Row, plain } from "./Row.jsx";

/* The admin password, made here or typed in, and a backup of everything. */
export function Upkeep({ admin }: { admin: boolean }) {
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
        const now = new Date().toISOString();
        const file = `/var/backups/ezyspeech-${now.slice(0, 19).replace(/[:T]/g, "-")}.tar.gz`;
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
                                <Form onSubmit={e => { e.preventDefault(); if (typedOk) newPassword(); }}>
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
