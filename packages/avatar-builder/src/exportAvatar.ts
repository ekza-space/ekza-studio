import { derivedId, type JointRecord, makeVrmMeta, type SkeletonRecord } from '@ekza-studio/doc';
import { type CharacterMeshIn, type CharacterWriteInput, lintVrmBytes, skeletonFromDoc } from '@ekza-studio/io';
import { loadMeshIo, manualModelProvenance, readBackCharacter, writeCharacter } from '@ekza-studio/io/write';
import { withSkin } from '@ekza-studio/mesh-core';
import type { RigJoint } from './rig';
import { type AvatarRecipe, avatarStyles } from './style';
import type { AvatarPiece, StylePack } from './types';

type ExportStyles = Pick<typeof avatarStyles, 'getStyle' | 'getRig' | 'buildAvatar'>;

const EXPORTER = 'EKZA Studio Avatar Builder';
const EXPORT_VERSION = '1.1.0';
const IDENTITY_PLACEMENT = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function createExportRig(recipe: AvatarRecipe, style: StylePack, bindPose: readonly RigJoint[]) {
  const templateVersion = `${style.rigId}@${style.rigVersion}`;
  const scope = [style.styleId, String(style.styleVersion), templateVersion, style.bodyId];
  const skeletonRecord: SkeletonRecord = {
    id: derivedId('skeleton', EXPORTER, scope, '', 0),
    character: derivedId('character', EXPORTER, [...scope, recipe.archetypeId], '', 0),
    template: 'vrm-humanoid',
    templateVersion,
    preset: 'custom',
    symmetry: false,
    deleted: null,
  };
  const jointId = (name: RigJoint['name']): JointRecord['id'] =>
    derivedId('joint', EXPORTER, [skeletonRecord.id, name], '', 0);
  const joints: readonly JointRecord[] = bindPose.map(({ name, parent, position }, index) => ({
    id: jointId(name),
    skeleton: skeletonRecord.id,
    parent: parent === null ? null : jointId(parent),
    order: String(index).padStart(4, '0'),
    name,
    humanBone: name,
    restPosition: position,
    restRotation: [0, 0, 0, 1],
    tail: null,
    side: name.startsWith('left') ? 'L' : name.startsWith('right') ? 'R' : 'C',
    mirror: null,
    deleted: null,
    role: 'bone',
    key: name,
  }));
  const jointIndices = new Map(bindPose.map(({ name }, index) => [name, index]));
  const skinPalette = joints.map(({ id, parent, mirror }) => ({ key: id, parent, mirror }));
  return { skeletonRecord, joints, jointIndices, skinPalette };
}

/** Each face has its own vertices so the writer keeps the same flat surface as the preview. */
function exportMesh(
  pieces: readonly AvatarPiece[],
  hexColor: string,
  rig: ReturnType<typeof createExportRig>,
  srgb8ToLinear: Awaited<ReturnType<typeof loadMeshIo>>['srgb8ToLinear'],
): CharacterMeshIn {
  const sources = pieces.map(({ name, geometry, bone }) => {
    const vertices = geometry.getAttribute('position');
    const indices = geometry.getIndex();
    const count = indices?.count ?? vertices.count;
    const joint = rig.jointIndices.get(bone);
    if (count === 0 || count % 3 !== 0) throw new Error(`${name} has no valid triangle list.`);
    if (joint === undefined) throw new Error(`${name} references the unknown joint ${bone}.`);
    return { vertices, indices, count, joint };
  });
  const corners = sources.reduce((total, { count }) => total + count, 0);
  const faces = corners / 3;
  const position = new Float32Array(corners * 3);
  const edgeVerts = new Uint32Array(corners * 2);
  const cornerVert = new Uint32Array(corners);
  const cornerNext = new Uint32Array(corners);
  const faceCorner = new Uint32Array(faces);
  const meshJoints = new Uint16Array(corners * 4);
  const weights = new Float32Array(corners * 4);

  for (let face = 0; face < faces; face += 1) faceCorner[face] = face * 3;
  let corner = 0;
  for (const { vertices, indices, count, joint } of sources) {
    // Every piece still uses its own rigid joint after it joins the material batch.
    for (let local = 0; local < count; local += 1) {
      const vertex = indices === null ? local : indices.getX(local);
      const next = local % 3 === 2 ? corner - 2 : corner + 1;
      position[corner * 3] = vertices.getX(vertex);
      position[corner * 3 + 1] = vertices.getY(vertex);
      position[corner * 3 + 2] = vertices.getZ(vertex);
      cornerVert[corner] = corner;
      cornerNext[corner] = next;
      edgeVerts[corner * 2] = corner;
      edgeVerts[corner * 2 + 1] = next;
      meshJoints[corner * 4] = joint;
      weights[corner * 4] = 1;
      corner += 1;
    }
  }

  const data: CharacterMeshIn['data'] = {
    counts: { points: corners, corners, edges: corners, faces },
    position,
    edgeVerts,
    edgeFlags: new Uint8Array(corners),
    cornerVert,
    cornerNext,
    faceCorner,
    faceMaterial: new Uint16Array(faces),
    faceFlags: new Uint8Array(faces),
    layers: new Map(),
  };
  const skin = { points: corners, palette: rig.skinPalette, joints: meshJoints, weights };

  const hex = Number.parseInt(hexColor.slice(1), 16);
  const color = srgb8ToLinear([(hex >>> 16) & 255, (hex >>> 8) & 255, hex & 255]);
  return {
    id: derivedId('mesh', EXPORTER, [rig.skeletonRecord.id, hexColor], '', 0),
    name: `Surface ${hexColor}`,
    data: withSkin(data, skin),
    skin,
    materials: [{ preset: 'lit', name: hexColor }],
    colourOutput: 'material-per-colour',
    paletteId: null,
    prop: false,
    assetMaterials: [
      {
        name: hexColor,
        baseColorFactor: [...color, 1],
        baseColorTexture: null,
        alphaMode: 'OPAQUE',
        alphaCutoff: null,
        doubleSided: false,
      },
    ],
  };
}

export async function exportAvatar(recipe: AvatarRecipe, styles: ExportStyles = avatarStyles): Promise<Uint8Array> {
  const style = styles.getStyle(recipe);
  const archetype = style.archetypes.find(({ id }) => id === recipe.archetypeId);
  if (archetype === undefined) throw new Error('Unknown archetype.');
  const rig = createExportRig(recipe, style, styles.getRig(recipe));
  const { srgb8ToLinear } = await loadMeshIo();
  const pieces = styles.buildAvatar(recipe);
  try {
    const batches = new Map<string, AvatarPiece[]>();
    for (const piece of pieces) {
      if (piece.previewOnly) continue;
      const color = piece.color.toLowerCase();
      const batch = batches.get(color);
      if (batch === undefined) batches.set(color, [piece]);
      else batch.push(piece);
    }
    const meshes = Array.from(batches, ([color, batch]) => exportMesh(batch, color, rig, srgb8ToLinear));
    const skeleton = skeletonFromDoc({
      skeleton: rig.skeletonRecord,
      joints: rig.joints,
      meshes: meshes.map(({ id, data, skin }) => ({ id, data, skin, placement: IDENTITY_PLACEMENT })),
    });
    const input: CharacterWriteInput = {
      skeleton,
      joints: rig.joints,
      meshes,
      palettes: new Map(),
      clips: [],
      vrm: makeVrmMeta(`${style.label} — ${archetype.label}`, {
        version: EXPORT_VERSION,
        authors: ['EKZA Studio'],
        licensePreset: 'personal',
      }),
      thumbnailPng: null,
      model: manualModelProvenance({
        toolVersion: EXPORT_VERSION,
        rig: 'vrm-humanoid',
        skeletonTemplate: rig.skeletonRecord.templateVersion,
      }),
      heightScale: null,
    };

    const bytes = await writeCharacter(input, { generator: EXPORTER, format: 'vrm' });
    const blocking = lintVrmBytes(bytes, (code) => (code === 'vrm.thumbnail-square' ? null : 'error'));
    const report = readBackCharacter(bytes, skeleton, meshes, []);
    if (blocking.length > 0 || !report.ok) {
      throw new Error([...blocking.map(({ message }) => message), ...report.problems].join(' '));
    }
    return bytes;
  } finally {
    for (const { geometry } of pieces) geometry.dispose();
  }
}
