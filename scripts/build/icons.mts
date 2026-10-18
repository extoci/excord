import { Resvg } from "@resvg/resvg-js";
import { readFile, writeFile } from "node:fs/promises";
import png2icons from "png2icons";

const svg = await readFile("build/excord.svg", "utf8");
const png = new Resvg(svg, { fitTo: { mode: "width", value: 1024 } }).render().asPng();
const ico = png2icons.createICO(png, png2icons.BICUBIC2, 0, true, true);
const icns = png2icons.createICNS(png, png2icons.BICUBIC2, 0);
if (!ico || !icns) throw new Error("Failed to generate desktop icons");
await writeFile("build/icon.svg", svg);
await writeFile("build/icon.ico", ico);
await writeFile("build/icon.icns", icns);
await writeFile("static/icon.ico", ico);
await writeFile("static/icon.png", new Resvg(svg, { fitTo: { mode: "width", value: 256 } }).render().asPng());
const tray = new Resvg(svg, { fitTo: { mode: "width", value: 32 } }).render().asPng();
await writeFile("static/tray.png", tray);
await writeFile("static/tray/tray.png", tray);
await writeFile("static/tray/trayUnread.png", tray);
