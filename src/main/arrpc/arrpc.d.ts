declare module "arrpc" {
    import { EventEmitter } from "node:events";
    import type { Server as HttpServer } from "node:http";
    import type { Server as NetServer } from "node:net";
    import type { WebSocketServer } from "ws";
    export interface RpcServer extends EventEmitter {
        ws: { http: HttpServer; wss: WebSocketServer };
        ipc: { server: NetServer };
        process?: unknown;
    }
    const Server: new () => Promise<RpcServer>;
    export default Server;
}
