/* SPDX-License-Identifier: AGPL-3.0-or-later */

import React, { useEffect, useRef, useState } from "react";
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Card, CardBody, CardHeader, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { EmptyState, EmptyStateBody } from "@patternfly/react-core/dist/esm/components/EmptyState/index.js";
import { SearchInput } from "@patternfly/react-core/dist/esm/components/SearchInput/index.js";
import { Switch } from "@patternfly/react-core/dist/esm/components/Switch/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";
import { Toolbar, ToolbarContent, ToolbarItem } from "@patternfly/react-core/dist/esm/components/Toolbar/index.js";

import { _, ezyLines } from "../ezyspeech.js";

export function Logs() {
    const [lines, setLines] = useState<string[]>([]);
    const [follow, setFollow] = useState(false);
    const [filter, setFilter] = useState("");
    const [requests, setRequests] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const box = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setLines([]);
        setError(null);
        const p = ezyLines(["logs", "-n", "300", ...(follow ? ["-f"] : [])],
                           line => setLines(prev => [...prev, line].slice(-1000)), "try");
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
                    <ToolbarContent alignItems="center">
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
