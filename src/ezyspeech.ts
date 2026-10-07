/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The ezyspeech command on the host, which this module does everything
 * through (`ezyspeech status --json`, `ezyspeech update --progress`, ...): the
 * same one the installer and the terminal use, so the page has no idea of its
 * own how EzySpeech is installed and cannot disagree with them about it.
 */

import cockpit from "cockpit";

export const _ = cockpit.gettext;

export const CMD = "ezyspeech";
// Administrative access runs commands with sudo's PATH, which on Red Hat-like
// systems leaves out /usr/local/bin, where the installer puts the command.
export const ENV = ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"];

export type Usage = {
    processes: { name: "listener" | "console" | "container"; memory: number | null;
                 cpu_ns?: number | null; cpu_percent?: number | null }[];
    memory_total: number | null;
    data_bytes: number | null;
    disk_free: number | null;
    at_ns: number;
};

export type Status = {
    mode: "native" | "docker" | "podman";
    home: string;
    version: string | null;
    releases: string[];
    // the release `ezyspeech rollback` would go back to (from 4.1.11)
    rollback_to?: string | null;
    running: boolean;
    health: { listener: boolean; console: boolean; version: string | null;
              port: number; admin_port: number; listeners: number | null };
    addresses?: { listener: string | null; console: string | null; https: boolean; console_https: boolean };
    usage?: Usage;
    services?: Record<string, string>;
    containers?: Record<string, string>;
};

export type Check = { installed: string; latest: string; update_available: boolean; notes: string; url: string };

function versionKey(v: string): number[] {
    return (v.match(/\d+/g) ?? []).slice(0, 3).map(Number);
}

/** The release a rollback goes back to: the newest one older than the one in
 *  use, as `ezyspeech rollback` chooses it. Newer servers say so in status. */
export function rollbackTarget(status: Status): string | null {
    if (status.rollback_to !== undefined)
        return status.rollback_to;
    const cur = versionKey(status.version ?? "");
    const older = status.releases.filter(r => {
        const k = versionKey(r);
        for (let i = 0; i < 3; i++)
            if ((k[i] ?? 0) !== (cur[i] ?? 0)) return (k[i] ?? 0) < (cur[i] ?? 0);
        return false;
    });
    return older[older.length - 1] ?? null;
}

/** Run `ezyspeech args...` (as root where it may) and parse its JSON. */
export function ezyJson<T>(args: string[]): Promise<T> {
    return new Promise((resolve, reject) => {
        cockpit.spawn([CMD, ...args], { environ: ENV, superuser: "try", err: "message" })
                .then((out: string) => {
                    try { resolve(JSON.parse(out)) } catch (e) { reject(new Error(out || String(e))) }
                })
                .catch((e: { message?: string; problem?: string }) => reject(new Error(e.message || e.problem || String(e))));
    });
}

/** Run `ezyspeech args...` as root; resolves with what it printed. */
export function ezy(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        cockpit.spawn([CMD, ...args], { environ: ENV, superuser: "require", err: "out" })
                .then((out: string) => resolve(out))
                .catch((e: { message?: string }, out?: string) => reject(new Error(out || e.message || String(e))));
    });
}

/** Run `ezyspeech args...` as root, handing each whole line it prints to onLine. */
export function ezyLines(args: string[], onLine: (line: string) => void,
    superuser: "try" | "require" = "require") {
    const proc = cockpit.spawn([CMD, ...args], { environ: ENV, superuser, err: "out" });
    let buffer = "";
    proc.stream((chunk: string) => {
        buffer += chunk;
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        parts.forEach(onLine);
    });
    return proc;
}
