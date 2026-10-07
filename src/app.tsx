/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * EzySpeech in Cockpit: status, updates, the admin password, backups and the
 * log, for a native install or a Docker one alike. All of it goes through
 * the ezyspeech command on the host; see ezyspeech.ts.
 */

import React from "react";
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { ClipboardCopy } from "@patternfly/react-core/dist/esm/components/ClipboardCopy/index.js";
import { Content } from "@patternfly/react-core/dist/esm/components/Content/index.js";
import { EmptyState, EmptyStateBody } from "@patternfly/react-core/dist/esm/components/EmptyState/index.js";
import { Page, PageSection } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner/index.js";
import { Grid, GridItem } from "@patternfly/react-core/dist/esm/layouts/Grid/index.js";
import { Stack, StackItem } from "@patternfly/react-core/dist/esm/layouts/Stack/index.js";

import { _ } from "./ezyspeech.js";
import { useAdmin, useStatus } from "./hooks.js";
import { Logs } from "./components/Logs.jsx";
import { Main } from "./components/Main.jsx";
import { Usage } from "./components/Usage.jsx";

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
                <StackItem>
                    <Grid hasGutter>
                        <GridItem xl={status.usage ? 8 : 12}><Main status={status} admin={admin} refresh={refresh} /></GridItem>
                        {status.usage && <GridItem xl={4}><Usage usage={status.usage} /></GridItem>}
                    </Grid>
                </StackItem>
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
