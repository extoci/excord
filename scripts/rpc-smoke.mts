import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { WebSocket } from "ws";
import type { RpcWorkerEvent } from "../src/main/arrpc/protocol";

const temporary = await mkdtemp(join(tmpdir(), "excord-rpc-"));
const worker = new Worker(resolve("dist/js/arRpcWorker.js"), {
    env: { ...process.env, ARRPC_NO_PROCESS_SCANNING: "1", ARRPC_DETECTABLE_CACHE_PATH: join(temporary, "detectable.json"),
        XDG_RUNTIME_DIR: temporary, TMPDIR: temporary }, stdout: true, stderr: true
});
worker.stdout?.resume(); worker.stderr?.resume();
const events: RpcWorkerEvent[] = [];
worker.on("message", (event: RpcWorkerEvent) => events.push(event));
let socket: WebSocket | undefined;
function wait<T>(check: () => T | undefined, timeout = 10000): Promise<T> {
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + timeout;
        const timer = setInterval(() => {
            const result = check();
            if (result !== undefined) { clearInterval(timer); resolve(result); }
            else if (Date.now() > deadline) { clearInterval(timer); reject(new Error(`RPC smoke timed out: ${JSON.stringify(events)}`)); }
        }, 20);
    });
}
try {
    const ready = await wait(() => events.find((event): event is Extract<RpcWorkerEvent, { type: "ready" }> => event.type === "ready"));
    assert.equal(ready.processScanning, false);
    socket = new WebSocket(`ws://127.0.0.1:${ready.port}/?v=1&client_id=1234567890`);
    const messages: Record<string, unknown>[] = [];
    socket.on("message", data => messages.push(JSON.parse(data.toString())));
    await wait(() => messages.find(message => message.evt === "READY"));
    socket.send(JSON.stringify({ cmd: "SET_ACTIVITY", nonce: "activity-1", args: { pid: process.pid, activity: { details: "Excord RPC test", state: "Testing", timestamps: { start: 1700000000 } } } }));
    const activity = await wait(() => events.find((event): event is Extract<RpcWorkerEvent, { type: "activity" }> => event.type === "activity"));
    assert.equal((activity.data as { activity: { details: string } }).activity.details, "Excord RPC test");
    await wait(() => messages.find(message => message.nonce === "activity-1"));
    socket.send(JSON.stringify({ cmd: "INVITE_BROWSER", nonce: "invite-1", args: { code: "excord-test" } }));
    const request = await wait(() => events.find((event): event is Extract<RpcWorkerEvent, { type: "request" }> => event.type === "request"));
    assert.equal(request.command, "invite");
    worker.postMessage({ nonce: request.nonce, success: false });
    const response = await wait(() => messages.find(message => message.nonce === "invite-1"));
    assert.equal(response.evt, "ERROR");
    socket.close();
    await wait(() => events.find(event => event.type === "activity" && (event.data as { activity: unknown }).activity === null));
    console.log(JSON.stringify({ status: "passed", websocketPort: ready.port, processScanning: ready.processScanning,
        checks: ["RPC handshake", "activity forwarding", "request acknowledgement", "disconnect cleanup"] }, null, 2));
} finally {
    socket?.terminate();
    await worker.terminate();
    await rm(temporary, { recursive: true, force: true });
}
