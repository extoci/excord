/*
 * Derived from Vesktop's arRPC worker.
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import Server from "arrpc";
import { randomUUID } from "node:crypto";
import { parentPort } from "node:worker_threads";
import type { RpcWorkerEvent } from "./protocol";

if (!parentPort) throw new Error("The RPC server must run in a worker");
const port = parentPort;
const callbacks = new Map<string, { callback: (success: boolean) => void; timer: NodeJS.Timeout }>();
const send = (event: RpcWorkerEvent) => port.postMessage(event);
function request(command: "invite" | "link", data: unknown, callback: (success: boolean) => void) {
    const nonce = randomUUID();
    const timer = setTimeout(() => { callbacks.delete(nonce); callback(false); }, 15000);
    timer.unref();
    callbacks.set(nonce, { callback, timer });
    send({ type: "request", nonce, command, data });
}
port.on("message", (message: { nonce: string; success: boolean }) => {
    const pending = callbacks.get(message.nonce);
    if (!pending) return;
    clearTimeout(pending.timer);
    callbacks.delete(message.nonce);
    pending.callback(message.success);
});
async function start() {
    const server = await new Server();
    const address = server.ws.http?.address();
    if (!address || typeof address === "string") throw new Error("No local RPC WebSocket port is available");
    server.on("activity", (data: unknown) => send({ type: "activity", data }));
    server.on("invite", (data: unknown, callback: (success: boolean) => void) => request("invite", data, callback));
    server.on("link", (data: unknown, callback: (success: boolean) => void) => request("link", data, callback));
    send({ type: "ready", port: address.port, processScanning: !!server.process });
}
void start().catch(error => {
    send({ type: "error", message: error instanceof Error ? error.message : String(error) });
    process.exit(1);
});
