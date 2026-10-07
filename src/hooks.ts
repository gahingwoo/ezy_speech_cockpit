/* SPDX-License-Identifier: AGPL-3.0-or-later */

import { useCallback, useEffect, useState } from "react";
import { superuser } from "superuser.js";

import { ezyJson, type Status } from "./ezyspeech.js";

const POLL_MS = 10000;

/** Whether Cockpit's administrative access is on, as it changes. */
export function useAdmin(): boolean {
    const [allowed, setAllowed] = useState<boolean>(superuser.allowed === true);
    useEffect(() => {
        const changed = () => setAllowed(superuser.allowed === true);
        superuser.addEventListener("changed", changed);
        return () => superuser.removeEventListener("changed", changed);
    }, []);
    return allowed;
}

/** `ezyspeech status`, read now and every ten seconds after. */
export function useStatus() {
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
