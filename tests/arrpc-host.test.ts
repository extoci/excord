import { expect, test } from "bun:test";

import { isLocalArrpcHost, sanitizeArrpcPort } from "../src/main/utils/arrpcHostValidation";

test("external RPC host validation accepts exact loopback addresses", () => {
    for (const host of ["", "localhost", "127.0.0.1", "127.12.255.3", "::1", "[::1]", "0.0.0.0"]) expect(isLocalArrpcHost(host)).toBe(true);
    for (const host of ["127.999.0.1", "[::1].example.com", "localhost.example.com", "192.168.1.10", "example.com", "127.0.0.1:1337"]) expect(isLocalArrpcHost(host)).toBe(false);
});

test("RPC ports must be complete integer values in the TCP port range", () => {
    for (const port of [1, 1337, 65535, "1337", " 1337 "]) expect(sanitizeArrpcPort(port)).toBe(Number(port));
    for (const port of [0, 65536, 1.5, "1337abc", "1.5", "", " ", undefined, null]) expect(sanitizeArrpcPort(port)).toBeUndefined();
});
