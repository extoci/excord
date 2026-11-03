# Third-party source

The desktop implementation derives from Equicord/Equibop at commit 57406f627221bc6054deb9834c18fa9cd914d96a. Equibop derives from Vencord/Vesktop. These projects license their code under GPL-3.0-or-later. Excord preserves their copyright headers.

The bundled plugin runtime and catalog are in vendor/equicord, copied from Equicord/Equicord at commit 00abcbeea2ddf4317e02843418f267db62bcb913. Equicord derives from Vendicated/Vencord. Its license is in vendor/equicord/LICENSE. Excord's runtime bridge and native registration patches appear in the same source tree and in src/excord.

Electron and its bundled Chromium libraries carry their own license notices in the distributed Electron runtime. Generated Equicord bundles preserve linked legal comment files. Builds also collect installed dependency license files into `dist/js/THIRD_PARTY_LICENSES.txt` and `static/runtime/THIRD_PARTY_LICENSES.txt` so notices accompany bundled dependencies. External dependencies retain their package license files.

The Node RPC worker uses Vencord/arrpc at commit 23e73dc9825469b5ba0e8be7c008b4ff6f177a28, licensed under MIT. Its worker integration derives from Vencord/Vesktop and preserves that project's GPL copyright notice. Excord does not distribute the former standalone arrpc-bun executable.

Excord does not claim affiliation with or support from Discord, Equicord, Equibop, Vencord, or Vesktop. Use Excord's own issue tracker for Excord-specific problems.
