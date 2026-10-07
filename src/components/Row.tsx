/* SPDX-License-Identifier: AGPL-3.0-or-later */

import React from "react";
import { DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { Icon } from "@patternfly/react-core/dist/esm/components/Icon/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import CheckCircleIcon from "@patternfly/react-icons/dist/esm/icons/check-circle-icon";
import ExclamationCircleIcon from "@patternfly/react-icons/dist/esm/icons/exclamation-circle-icon";
import ExclamationTriangleIcon from "@patternfly/react-icons/dist/esm/icons/exclamation-triangle-icon";
import ExternalLinkAltIcon from "@patternfly/react-icons/dist/esm/icons/external-link-alt-icon";
import cockpit from "cockpit";

import { _ } from "../ezyspeech.js";

/* One line of status, laid out as PatternFly's status card does it: an icon
 * and a word for the state on the left, what it is about and a detail on the
 * right. */
export function Row({ icon, state, children, detail }: {
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

export const ok = <Icon status="success"><CheckCircleIcon /></Icon>;
export const bad = <Icon status="danger"><ExclamationCircleIcon /></Icon>;
export const warn = <Icon status="warning"><ExclamationTriangleIcon /></Icon>;
export const info = (icon: React.ReactNode) => <Icon status="info">{icon}</Icon>;
export const plain = (icon: React.ReactNode) => <Icon>{icon}</Icon>;

/** A link that opens in a new tab, marked as one. */
export function OutLink({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href} target="_blank" rel="noopener noreferrer">{children} <ExternalLinkAltIcon /></a>;
}

/* Where a server can be opened. Its public address when one is configured;
 * otherwise this machine's port, linked only when Cockpit itself was opened
 * by an address that reaches the machine (an IP or a local name). Through a
 * tunnel or proxy, "cockpit.example.org:1915" would lead nowhere. */
export function Address({ url, port, https }: { url: string | null | undefined; port: number; https: boolean }) {
    if (url)
        return <OutLink href={url}>{url.replace(/^https?:\/\//, "")}</OutLink>;
    const host = window.location.hostname;
    const direct = /^[\d.]+$|:|^localhost$|\.local$|^[^.]+$/.test(host);
    if (!direct)
        return <>{cockpit.format(_("Port $0 on this machine"), port)}</>;
    const target = `${https ? "https" : "http"}://${host.includes(":") ? `[${host}]` : host}:${port}`;
    return <OutLink href={target}>{host}:{port}</OutLink>;
}
