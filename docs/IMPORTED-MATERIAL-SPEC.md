# Imported material colours — development MVP

Status: implementation contract for Hub platform MAT-01, AC3 (2026-10-30). This adds no new game approval or
`ekza.package.v1` fill. Game compatibility still requires validation and an approved exact rendition.

A standard glTF metallic-roughness or unlit material can override its linear base RGB. Source alpha, textures,
geometry, rig, metadata and all unrelated material fields stay unchanged. MToon and other material extensions
are unsupported and explicitly explained. Texture painting, opacity, shader code and new material graphs are excluded.

Identity = exact source asset SHA-256 + material index + SHA-256 of canonical material JSON. Names never identify a
material. Finite components are in 0..1. An override cannot target a different base or change source alpha. Patches
are validated before application and written in material-index order; no timestamps are generated.

The extension table `ekza.materialOverrides` v1 stores rows `{id, character, baseSha256, material, materialSha256,
baseColorFactor:[r,g,b,a], deleted}` in the character partition. One row per character/material. Ordinary transactions
make Set/Reset one undo step. `.ekzanim` snapshots preserve rows and source blobs. Existing apps preserve opaque
rows but do not display/apply these overrides; use a build advertising `imported-pbr-base-color/v1` to edit/export.
No core document schema or package schema change.

Operators:

- `material.setBaseColor {character, baseSha256, material, materialSha256, baseColorFactor}` sets one row.
- `material.resetBaseColor {character, material}` removes the row and restores source colour.

Attributes › Imported materials shows supported targets, a colour picker (sRGB UI converted to linear), Reset,
and an explicit colour-variant export. It retains the source texture, so the chosen colour multiplies that texture.
The ordinary animation bake export also applies overrides; animation-only/VRMA exports do not contain materials.
A material-only bake permits zero clips and preserves source animations. Preview loads exactly the patched glTF
parameters through Studio's normal model loader. Overrides are never assigned by material names.

Tests must prove deterministic bake, exact material targeting, source/unrelated JSON/BIN/rig preservation,
material read-back, wrong hash/fingerprint/alpha/nonfinite rejection, undo/redo and `.ekzanim` save/reopen. Existing
Space/OMOBA viewer acceptance is a separate consumer gate; exporting a colour is not a compatibility badge.
