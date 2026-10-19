import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Installing/uninstalling writes OS registration. Restrict this check to disposable CI runners.
assert.ok(process.env.CI, "Installer checks require an isolated CI runner");
assert.ok(process.platform === "darwin" || process.platform === "win32");
const root = await mkdtemp(join(tmpdir(), "excord-install-"));
const profile = join(root, "profile with spaces");
const destination = join(root, "application");
const mounted = join(root, "mounted");
const marker = join(profile, "result.json");
await mkdir(join(profile, "plugins/install-probe"), { recursive: true });
await writeFile(
  join(profile, "plugins/install-probe/index.ts"),
  `import definePlugin,{StartAt} from "@utils/types";
export default definePlugin({name:"ExcordInstallProbe",description:"Installer check",authors:[],enabledByDefault:true,startAt:StartAt.DOMContentLoaded,start(){VencordNative.pluginHelpers.ExcordInstallProbe.finish();}});`,
);
await writeFile(
  join(profile, "plugins/install-probe/native.ts"),
  `import {app,session} from "electron";import {writeFileSync} from "node:fs";
export async function finish(){
 const phase=process.env.EXCORD_INSTALL_PHASE;
 const cookie=(await session.defaultSession.cookies.get({url:"https://discord.com",name:"excord-install-persistence"}))[0];
 if(phase!=="first"&&cookie?.value!=="test-only")throw Error("Session cookie did not survive restart/reinstallation");
 await session.defaultSession.cookies.set({url:"https://discord.com",name:"excord-install-persistence",value:"test-only",expirationDate:Date.now()/1000+3600});
 await session.defaultSession.cookies.flushStore();
 const result={phase,persistence:phase==="first"||cookie?.value==="test-only",quit:false};
 app.once("quit",()=>{result.quit=true;writeFileSync(${JSON.stringify(marker)},JSON.stringify(result));});
 setTimeout(()=>app.quit(),100);return true;
}`,
);
async function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs = 120000,
) {
  const environment = { ...env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(command, args, {
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let forced = false;
  child.stdout.on("data", (data) => {
    output = (output + data).slice(-12000);
  });
  child.stderr.on("data", (data) => {
    output = (output + data).slice(-12000);
  });
  const timeout = setTimeout(() => {
    forced = true;
    child.kill();
  }, timeoutMs);
  try {
    const result = await new Promise<{
      code: number | null;
      signal: string | null;
    }>((done, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => done({ code, signal }));
    });
    assert.equal(forced, false, `Timed out running ${command}: ${output}`);
    assert.equal(result.code, 0, `${command}: ${output}`);
  } finally {
    clearTimeout(timeout);
    child.stdout.destroy();
    child.stderr.destroy();
  }
}
let appBundle: string | undefined;
let executable: string;
const files = await readdir("dist");
const installer = resolve(
  "dist",
  files.find((file) =>
    process.platform === "darwin"
      ? file.endsWith(".dmg")
      : /^Excord-Setup-.*\.exe$/.test(file),
  )!,
);
const results: { phase: string; persistence: boolean; quit: boolean }[] = [];
async function install() {
  if (process.platform === "darwin") {
    await mkdir(mounted, { recursive: true });
    await run("hdiutil", [
      "attach",
      installer,
      "-nobrowse",
      "-readonly",
      "-mountpoint",
      mounted,
    ]);
    try {
      const bundle = (await readdir(mounted)).find((name) =>
        name.endsWith(".app"),
      );
      assert.ok(bundle);
      appBundle = join(destination, bundle);
      await mkdir(destination, { recursive: true });
      await run("ditto", [join(mounted, bundle), appBundle]);
    } finally {
      await run("hdiutil", ["detach", mounted]);
    }
    executable = join(appBundle!, "Contents/MacOS/excord");
  } else {
    await run(installer, ["/S", "/currentuser", `/D=${destination}`]);
    executable = join(destination, "excord.exe");
  }
  await access(executable);
}
async function launch(phase: string) {
  await rm(marker, { force: true });
  await run(
    executable,
    [],
    {
      ...process.env,
      EXCORD_USER_DATA_DIR: profile,
      EXCORD_INSTALL_PHASE: phase,
    },
    60000,
  );
  const result = JSON.parse(await readFile(marker, "utf8"));
  assert.equal(result.phase, phase);
  assert.equal(result.quit, true);
  assert.equal(result.persistence, true);
  results.push(result);
}
try {
  await install();
  await launch("first");
  await launch("relaunch");
  await install();
  await launch("reinstalled");
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/installer-smoke.json",
    JSON.stringify(
      {
        platform: process.platform,
        installer: installer.split(/[\\/]/).pop(),
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    "Installer, relaunch, reinstallation, and session persistence checks passed",
    results,
  );
} finally {
  if (process.platform === "win32")
    await run(join(destination, "Uninstall Excord.exe"), ["/S"]).catch(
      (error) => console.error("Test uninstaller cleanup:", error),
    );
  await rm(root, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 500,
  });
}
