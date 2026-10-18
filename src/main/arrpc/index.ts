/* Excord RPC integration. SPDX-License-Identifier: GPL-3.0-or-later */
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { WebSocket } from "ws";
import { IpcCommands, IpcEvents } from "../../shared/IpcEvents";
import { SESSION_DATA_DIR } from "../constants";
import { sendRendererCommand } from "../ipcCommands";
import { mainWin } from "../mainWindow";
import { Settings } from "../settings";
import { isLocalArrpcHost, sanitizeArrpcPort } from "../utils/arrpcHostValidation";
import type { RpcWorkerEvent } from "./protocol";

interface Activity { socketId: string; applicationId: string; name: string; pid: number | null; startTime: number | null }
let worker: Worker | undefined;
let external: WebSocket | undefined;
let reconnect: NodeJS.Timeout | undefined;
let lifecycle: Promise<void> = Promise.resolve();
let startedAt: number | null = null;
let readyAt: number | null = null;
let rpcPort: number | null = null;
let lastError: string | null = null;
let lastExitCode: number | null = null;
let configured = false;
let stopping = false;
const activities = new Map<string, Activity>();
const activePackets = new Map<string, unknown>();

function activity(data: unknown) {
    if (!data || typeof data !== "object") return;
    const packet = data as Record<string, unknown>;
    const id = String(packet.socketId ?? "external");
    if (packet.activity === null) { activities.delete(id); activePackets.delete(id); }
    else if (packet.activity && typeof packet.activity === "object") {
        const value = packet.activity as Record<string, unknown>;
        activities.set(id, { socketId: id, applicationId: String(value.application_id ?? ""),
            name: String(value.name ?? value.details ?? value.application_id ?? "Activity"),
            pid: typeof packet.pid === "number" ? packet.pid : null, startTime: Date.now() });
        activePackets.set(id, data);
    } else return;
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(IpcEvents.ARRPC_ACTIVITY, data);
}
export function restoreArRPCActivities() {
    if (!mainWin || mainWin.isDestroyed()) return;
    for (const packet of activePackets.values()) mainWin.webContents.send(IpcEvents.ARRPC_ACTIVITY, packet);
}
function clearActivities() {
    for (const socketId of [...activities.keys()]) activity({ socketId, activity: null });
    activities.clear(); activePackets.clear();
}
function serialize(action: () => Promise<void>): Promise<void> {
    const next = lifecycle.then(action, action);
    lifecycle = next.catch(error => { lastError = error instanceof Error ? error.message : String(error); console.error("[Excord RPC]", error); });
    return lifecycle;
}
async function stop() {
    stopping = true;
    if (reconnect) clearTimeout(reconnect);
    reconnect = undefined;
    const socket = external; external = undefined;
    socket?.removeAllListeners(); socket?.on("error", () => {}); socket?.terminate();
    const current = worker; worker = undefined;
    if (current) await current.terminate();
    clearActivities(); readyAt = null; startedAt = null; rpcPort = null; stopping = false;
}
function connectExternal() {
    const host = (Settings.store.arRPCWebSocketCustomHost || "127.0.0.1").trim().toLowerCase();
    if (!isLocalArrpcHost(host)) { lastError = "An external RPC server must use a loopback address."; return; }
    const port = sanitizeArrpcPort(Settings.store.arRPCWebSocketCustomPort) || 1337;
    const address = host === "[::1]" || host === "::1" ? "[::1]" : host === "0.0.0.0" ? "127.0.0.1" : host;
    const socket = external = new WebSocket(`ws://${address}:${port}`, { maxPayload: 1024 * 1024, handshakeTimeout: 5000 });
    socket.on("open", () => { readyAt = Date.now(); rpcPort = port; lastError = null; });
    socket.on("message", data => {
        try { activity(JSON.parse(data.toString())); }
        catch { lastError = "The external RPC server sent invalid JSON."; }
    });
    socket.on("error", error => { lastError = error.message; });
    socket.on("close", () => {
        if (external !== socket) return;
        external = undefined; readyAt = null;
        clearActivities();
        if (!stopping && Settings.store.arRPCWebSocketAutoReconnect && !Settings.store.arRPCDisabled && !Settings.store.arRPC) {
            reconnect = setTimeout(connectExternal, 5000); reconnect.unref();
        }
    });
}
async function start() {
    if (Settings.store.arRPCDisabled || worker || external) return;
    startedAt = Date.now(); lastError = null;
    if (!Settings.store.arRPC) { connectExternal(); return; }
    const current = worker = new Worker(join(__dirname, "arRpcWorker.js"), {
        env: { ...process.env, ARRPC_DETECTABLE_CACHE_PATH: join(SESSION_DATA_DIR, "arrpc-detectable-db.json"),
            ARRPC_NO_PROCESS_SCANNING: Settings.store.arRPCProcessScanning ? "" : "1", ARRPC_DEBUG: Settings.store.arRPCDebug ? "1" : "" },
        stdout: !Settings.store.arRPCDebug, stderr: false
    });
    current.stdout?.resume();
    current.on("message", async (event: RpcWorkerEvent) => {
        if (current !== worker) return;
        if (event.type === "ready") { readyAt = Date.now(); rpcPort = event.port; }
        else if (event.type === "activity") activity(event.data);
        else if (event.type === "error") lastError = event.message;
        else if (event.type === "request") {
            let success = false;
            try {
                if (event.command === "invite" && typeof event.data === "string" && /^[\w-]+$/.test(event.data)) success = await sendRendererCommand<boolean>(IpcCommands.RPC_INVITE, event.data);
                else if (event.command === "link") success = await sendRendererCommand<boolean>(IpcCommands.RPC_DEEP_LINK, event.data);
            } catch { /* An unavailable renderer declines the RPC request. */ }
            if (current === worker) current.postMessage({ nonce: event.nonce, success });
        }
    });
    current.on("error", error => { lastError = error instanceof Error ? error.message : String(error); console.error("[Excord RPC] Worker failed:", error); });
    current.on("exit", code => { lastExitCode = code; if (current === worker) { worker = undefined; readyAt = null; clearActivities(); } });
}
export function getArRPCStatus() {
    return { running: !!worker || external?.readyState === WebSocket.OPEN, pid: worker ? process.pid : null,
        port: rpcPort, host: "127.0.0.1", enabled: !Settings.store.arRPCDisabled, lastError, lastExitCode,
        uptime: startedAt ? Date.now() - startedAt : null, readyTime: readyAt ? Date.now() - readyAt : null,
        restartCount: 0, binaryPath: null, isReady: readyAt !== null, isStale: false,
        appVersion: "arRPC 3.7.0 · Electron worker", activities: [...activities.values()] };
}
export const destroyArRPC = () => serialize(stop);
export const initArRPC = () => serialize(start);
export const restartArRPC = () => serialize(async () => { await stop(); await start(); });
const settingsChanged = () => { void restartArRPC(); };
const watched = ["arRPC", "arRPCDisabled", "arRPCDebug", "arRPCProcessScanning", "arRPCWebSocketCustomHost", "arRPCWebSocketCustomPort", "arRPCWebSocketAutoReconnect"] as const;
export function setupArRPC() {
    if (configured) return;
    configured = true;
    for (const key of watched) Settings.addChangeListener(key, settingsChanged);
}
export async function cleanupArRPC() {
    for (const key of watched) Settings.removeChangeListener(key, settingsChanged);
    configured = false;
    await destroyArRPC();
}
