# Hub imported-material MVP — local evidence (2026-10-30)

Implements MAT-01 / E03 and the parent HUB-PLATFORM-20261030 AC3 development slice. Normative local contract:
[IMPORTED-MATERIAL-SPEC](../IMPORTED-MATERIAL-SPEC.md). This is development implementation evidence, not a hosted
release or game approval.

- Identity: original source SHA-256, material index, canonical material fingerprint. Wrong base/fingerprint, duplicate
  edits, nonfinite/out-of-range values and alpha changes are rejected.
- Standard glTF PBR/unlit RGB only. MToon, other extensions and legacy Unity materials are explicitly unsupported.
  Textures, opacity, rig, geometry, unrelated materials and source credits remain unchanged. No shader code.
- Undoable Set/Reset operators write the optional `ekza.materialOverrides` table. Pro Attributes and Simple Palette
  use the same panel. Editable `.ekzanim` snapshots include source blobs and overrides.
- Preview rebuilds through the existing display loader using the same patched glTF parameters as export.
- Material-only export selects no clips and deliberately does not invoke animation rollback or replace animation
  provenance. Combined animation bake applies the same source-bound colour patch.

## Verification

All commands passed locally:

```sh
pnpm exec tsc -b packages/editor packages/halo
pnpm --filter @ekza-studio/io exec vitest run test/material-overrides.test.ts test/surgeon.test.ts test/surgeon-geometry.test.ts
# 30 tests
pnpm --filter @ekza-studio/editor-core exec vitest run test/material-overrides.test.ts test/m6a/mesh-io.test.ts test/builtin/registration.test.ts
# 23 tests
pnpm --filter @ekza-studio/halo exec vitest run test/manifest/manifest.test.ts
# 14 tests
pnpm --filter @ekza-studio/editor exec vitest run test/imported-materials.test.tsx
# 1 browser test (installed Chrome)
```

Focused oxlint and Biome checks passed on the changed material feature files. Browser proof changes the colour
through the hex UI, verifies the real Three GLTFLoader's displayed material factors, downloads matching output and
resets to source. The source fixtures are generated in tests, so no new third-party binary fixture is introduced.
The project test saves/reopens `.ekzanim`, verifies undo/redo and compares preview/export materials. IO tests prove
byte determinism and preserve a previously baked animation and its metadata through a colour-only export.

Consumer acceptance in the actual Space/OMOBA renderers remains separate. Source edit capability does not create
an in-game compatibility badge. This scope does not add texture painting, live collaboration, commercial rights or
new runtime package fills.
