# Third-party source

The desktop implementation derives from Equicord/Equibop at commit 27219be3566589280c0c933b04753805381d3bc8. Equibop derives from Vencord/Vesktop. These projects license their code under GPL-3.0-or-later. Excord preserves their copyright headers.

The bundled plugin runtime and catalog are in vendor/equicord, copied from Equicord/Equicord at commit e0e85c8d4f6dc73aac9368cf3f4b2200eac4d4b4. Equicord derives from Vendicated/Vencord. Its license is in vendor/equicord/LICENSE. Excord's runtime bridge and native registration patches appear in the same source tree and in src/excord.

Electron and its bundled Chromium libraries carry their own license notices in the distributed Electron runtime. Generated Equicord bundles preserve linked legal comment files. Builds also collect installed dependency license files into `dist/js/THIRD_PARTY_LICENSES.txt` and `static/runtime/THIRD_PARTY_LICENSES.txt` so notices accompany bundled dependencies. External dependencies retain their package license files.

The Node RPC worker uses Vencord/arrpc at commit 1dc801e8ea14d96ce8dccff416417614f058afb8, licensed under MIT. Its worker integration derives from Vencord/Vesktop and preserves that project's GPL copyright notice. Excord does not distribute the former standalone arrpc-bun executable.

Excord does not claim affiliation with or support from Discord, Equicord, Equibop, Vencord, or Vesktop. Use Excord's own issue tracker for Excord-specific problems.
