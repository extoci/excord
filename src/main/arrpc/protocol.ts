export type RpcWorkerEvent =
    | { type: "ready"; port: number; processScanning: boolean }
    | { type: "activity"; data: unknown }
    | { type: "request"; nonce: string; command: "invite" | "link"; data: unknown }
    | { type: "error"; message: string };
