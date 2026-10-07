/* SPDX-License-Identifier: AGPL-3.0-or-later */

import React, { useEffect, useRef, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { Progress } from "@patternfly/react-core/dist/esm/components/Progress/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";
import { Stack, StackItem } from "@patternfly/react-core/dist/esm/layouts/Stack/index.js";
import cockpit from "cockpit";

import { _, type Usage as UsageData } from "../ezyspeech.js";

function size(bytes: number | null | undefined): string {
    return bytes === null || bytes === undefined ? "?" : cockpit.format_bytes(bytes);
}

export function Usage({ usage }: { usage: UsageData }) {
    // CPU time is a running total; a share of it needs two readings.
    const last = useRef<UsageData | null>(null);
    const [cpu, setCpu] = useState<Record<string, number>>({});

    useEffect(() => {
        const before = last.current;
        last.current = usage;
        if (!before || usage.at_ns <= before.at_ns) return;
        const next: Record<string, number> = {};
        for (const p of usage.processes) {
            const q = before.processes.find(x => x.name === p.name);
            if (p.cpu_ns != null && q?.cpu_ns != null)
                next[p.name] = Math.max(0, (p.cpu_ns - q.cpu_ns) / (usage.at_ns - before.at_ns) * 100);
        }
        setCpu(next);
    }, [usage]);

    const names: Record<string, string> = {
        listener: _("Listener page"), console: _("Operator's console"), container: _("Container"),
    };

    return (
        <Card isFullHeight>
            <CardHeader><CardTitle><Title headingLevel="h2" size="lg">{_("Usage")}</Title></CardTitle></CardHeader>
            <CardBody>
                <Stack hasGutter>
                    {usage.processes.map(p => {
                        const share = p.memory != null && usage.memory_total ? p.memory / usage.memory_total * 100 : 0;
                        const load = p.cpu_percent ?? cpu[p.name];
                        return (
                            <StackItem key={p.name}>
                                <Progress value={share} title={names[p.name] ?? p.name} size="sm"
                                          label={size(p.memory)} valueText={size(p.memory)}
                                          aria-label={cockpit.format(_("Memory used by $0"), names[p.name] ?? p.name)} />
                                <div className="ezy-detail">
                                    {cockpit.format(_("$0% of memory"), share.toFixed(1))}
                                    {" · "}
                                    {load === undefined ? _("CPU: measuring") : cockpit.format(_("CPU: $0%"), load.toFixed(1))}
                                </div>
                            </StackItem>
                        );
                    })}
                    <StackItem>
                        <DescriptionList isCompact isHorizontal aria-label={_("Storage")}>
                            <DescriptionListGroup>
                                <DescriptionListTerm>{_("Transcripts")}</DescriptionListTerm>
                                <DescriptionListDescription>{size(usage.data_bytes)}</DescriptionListDescription>
                            </DescriptionListGroup>
                            <DescriptionListGroup>
                                <DescriptionListTerm>{_("Free on disk")}</DescriptionListTerm>
                                <DescriptionListDescription>{size(usage.disk_free)}</DescriptionListDescription>
                            </DescriptionListGroup>
                        </DescriptionList>
                    </StackItem>
                </Stack>
            </CardBody>
        </Card>
    );
}
