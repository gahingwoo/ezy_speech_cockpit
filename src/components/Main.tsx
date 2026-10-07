/* SPDX-License-Identifier: AGPL-3.0-or-later */

import React, { useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { Tab, Tabs, TabTitleText } from "@patternfly/react-core/dist/esm/components/Tabs/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";

import { _, type Status } from "../ezyspeech.js";
import { ServiceActions, Services } from "./Services.jsx";
import { Updates } from "./Updates.jsx";
import { Upkeep } from "./Upkeep.jsx";

/* The one card for EzySpeech itself: its state, its updates, its password
 * and backups, a tab each, as PatternFly's tabbed status card. */
export function Main({ status, admin, refresh }: { status: Status; admin: boolean; refresh: () => void }) {
    const [tab, setTab] = useState<string | number>("services");
    const tabs: [string, string][] = [["services", _("Services")], ["updates", _("Updates")], ["upkeep", _("Password and backups")]];

    return (
        <Card isFullHeight>
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
