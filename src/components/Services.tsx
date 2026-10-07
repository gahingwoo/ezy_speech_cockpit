/* SPDX-License-Identifier: AGPL-3.0-or-later */

import React, { useState } from "react";
import { Alert, AlertActionCloseButton } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Content } from "@patternfly/react-core/dist/esm/components/Content/index.js";
import { DescriptionList } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import ServerIcon from "@patternfly/react-icons/dist/esm/icons/server-icon";
import cockpit from "cockpit";

import { _, ezy, type Status } from "../ezyspeech.js";
import { Confirm } from "./Confirm.jsx";
import { Address, Row, bad, ok, plain } from "./Row.jsx";

export function Services({ status }: { status: Status }) {
    const h = status.health;
    const a = status.addresses;
    const listening = h.listeners !== null && h.listeners !== undefined
        ? cockpit.format(_("Listener page, port $0, $1 listening now"), h.port, h.listeners)
        : cockpit.format(_("Listener page, port $0"), h.port);

    return (
        <DescriptionList isHorizontal columnModifier={{ lg: "2Col" }} aria-label={_("Services")}>
            <Row icon={h.listener ? ok : bad} state={h.listener ? _("Running") : _("Not answering")}
                 detail={listening}>
                <Address url={a?.listener} port={h.port} https={!!a?.https} />
            </Row>
            <Row icon={h.console ? ok : bad} state={h.console ? _("Running") : _("Not answering")}
                 detail={cockpit.format(_("Operator's console, port $0"), h.admin_port)}>
                <Address url={a?.console} port={h.admin_port} https={!!a?.console_https} />
            </Row>
            <Row icon={plain(<ServerIcon />)} state={{ docker: _("Docker"), podman: _("Podman"), native: _("Native") }[status.mode] ?? status.mode}
                 detail={cockpit.format(_("Releases kept: $0"), status.releases.join(", "))}>
                {status.home}
            </Row>
        </DescriptionList>
    );
}

/* Restart, Stop or Start, in the card's header. Stopping cuts off everyone
 * listening until someone starts it again, so it asks first; a restart is
 * over in seconds and does not. */
export function ServiceActions({ status, admin, refresh }: { status: Status; admin: boolean; refresh: () => void }) {
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [askStop, setAskStop] = useState(false);

    const act = (verb: string) => {
        setAskStop(false);
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
                                    onClick={() => setAskStop(true)}>{_("Stop")}</Button>
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
            <Confirm isOpen={askStop} isDanger title={_("Stop EzySpeech?")} action={_("Stop")}
                     onConfirm={() => act("stop")} onCancel={() => setAskStop(false)}>
                <Content component="p">
                    {_("Everyone listening is cut off, and the console cannot record, until it is started again.")}
                </Content>
            </Confirm>
        </>
    );
}
