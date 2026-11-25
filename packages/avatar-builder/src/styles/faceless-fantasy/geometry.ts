import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  OctahedronGeometry,
  Quaternion,
  TorusGeometry,
  Vector3,
} from 'three';
import type { BoneName } from '../../rig';
import type { AvatarPalette, AvatarPiece, AvatarRecipe } from '../../types';

type Point = readonly [number, number, number];
type Ring = readonly Point[];
type Profile = readonly [height: number, width: number, depth: number, z?: number];

function tint(color: string, toward: string, amount: number): string {
  return `#${new Color(color).lerp(new Color(toward), amount).getHexString()}`;
}

function triangle(positions: number[], a: Point, b: Point, c: Point) {
  positions.push(...a, ...b, ...c);
}

function geometryElement<T>(elements: readonly T[], index: number): T {
  const element = elements[index];
  if (element === undefined) throw new Error('Invalid authored geometry index.');
  return element;
}

function center(ring: Ring): Point {
  const sum = ring.reduce(([x, y, z], point) => [x + point[0], y + point[1], z + point[2]], [0, 0, 0]);
  return [sum[0] / ring.length, sum[1] / ring.length, sum[2] / ring.length];
}

function surface(positions: number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// The rings are authored in consistent winding. Duplicated vertices keep the planes faceted.
function loft(rings: readonly Ring[], closeStart = false, closeEnd = false): BufferGeometry {
  const positions: number[] = [];
  const start = geometryElement(rings, 0);
  const end = geometryElement(rings, rings.length - 1);
  const startCenter = center(start);
  const endCenter = center(end);
  for (let edge = 0; edge < start.length; edge++) {
    const next = (edge + 1) % start.length;
    if (closeStart) triangle(positions, startCenter, geometryElement(start, next), geometryElement(start, edge));
    for (let row = 1; row < rings.length; row++) {
      const lower = geometryElement(rings, row - 1);
      const upper = geometryElement(rings, row);
      const lowerEdge = geometryElement(lower, edge);
      const lowerNext = geometryElement(lower, next);
      const upperEdge = geometryElement(upper, edge);
      const upperNext = geometryElement(upper, next);
      triangle(positions, lowerEdge, lowerNext, upperNext);
      triangle(positions, lowerEdge, upperNext, upperEdge);
    }
    if (closeEnd) triangle(positions, endCenter, geometryElement(end, edge), geometryElement(end, next));
  }
  return surface(positions);
}

function ellipse([height, width, depth, z = 0]: Profile, sides: number, phase = 0): Ring {
  return Array.from({ length: sides }, (_, index) => {
    const angle = ((index + 0.5) * 2 * Math.PI) / sides + phase;
    return [width * Math.sin(angle), height, z + depth * Math.cos(angle)];
  });
}

function garment(profile: readonly Profile[], sides = 8, close = true): BufferGeometry {
  return loft(
    profile.map((row) => ellipse(row, sides)),
    close,
    close,
  );
}

function jewel(x: number, y: number, z: number, width: number, height: number, depth: number): BufferGeometry {
  return new OctahedronGeometry(1).scale(width, height, depth).translate(x, y, z);
}

function rod(a: Point, b: Point, top: number, bottom = top, sides = 6): BufferGeometry {
  const start = new Vector3(...a);
  const direction = new Vector3(...b).sub(start);
  const midpoint = start.addScaledVector(direction, 0.5);
  const geometry = new CylinderGeometry(top, bottom, direction.length(), sides);
  geometry.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()));
  return geometry.translate(midpoint.x, midpoint.y, midpoint.z);
}

function add(
  pieces: AvatarPiece[],
  name: string,
  geometry: BufferGeometry,
  color: string,
  bone: BoneName,
  previewOnly = false,
  previewGlow?: number,
) {
  pieces.push({ name, geometry, color, bone, previewOnly, ...(previewGlow === undefined ? {} : { previewGlow }) });
}

function addBody(pieces: AvatarPiece[], palette: AvatarPalette, headwear: string) {
  const ink = tint(palette.dark, '#515267', 0.23);
  const undercloth = tint(palette.dark, '#85869a', 0.33);
  const ivory = tint('#d4cec8', palette.secondary, 0.21);
  const soles = tint(palette.dark, '#716579', 0.37);
  add(
    pieces,
    'Collar lining',
    garment(
      [
        [1.239, 0.088, 0.075],
        [1.355, 0.075, 0.068],
        [1.436, 0.056, 0.053],
      ],
      7,
    ),
    ink,
    'spine',
  );

  const shoulder = headwear === 'angular-hood' ? 0.081 : 0.071;
  for (const label of ['left', 'right'] as const) {
    const side = label === 'left' ? 1 : -1;
    const upperArm = `${label}UpperArm` as const;
    const lowerArm = `${label}LowerArm` as const;
    const hand = `${label}Hand` as const;
    const upperLeg = `${label}UpperLeg` as const;
    const lowerLeg = `${label}LowerLeg` as const;
    const foot = `${label}Foot` as const;
    const onArm = (profile: readonly Profile[], sides = 7) =>
      garment(profile, sides)
        .rotateZ((-side * Math.PI) / 2)
        .translate(0, 1.22, 0);
    const onLeg = (profile: readonly Profile[], sides = 7) => garment(profile, sides).translate(side * 0.1, 0, 0);

    add(
      pieces,
      `${label} upper sleeve`,
      onArm([
        [0.184, shoulder * 0.92, 0.066],
        [0.235, shoulder, 0.076],
        [0.371, 0.055, 0.049],
        [0.456, 0.047, 0.046],
      ]),
      ink,
      upperArm,
    );
    add(
      pieces,
      `${label} sleeve edge`,
      onArm([
        [0.353, 0.056, 0.052],
        [0.378, 0.056, 0.052],
      ]),
      undercloth,
      upperArm,
    );
    add(
      pieces,
      `${label} forearm`,
      onArm([
        [0.424, 0.045, 0.043],
        [0.498, 0.042, 0.044],
        [0.613, 0.033, 0.036],
        [0.653, 0.031, 0.035],
      ]),
      ink,
      lowerArm,
    );
    add(
      pieces,
      `${label} cuff`,
      onArm([
        [0.603, 0.038, 0.042],
        [0.637, 0.037, 0.042],
      ]),
      tint(undercloth, palette.secondary, 0.36),
      lowerArm,
    );
    add(
      pieces,
      `${label} glove`,
      onArm([
        [0.63, 0.034, 0.037],
        [0.661, 0.041, 0.047, 0.004],
        [0.709, 0.031, 0.037, 0.004],
        [0.722, 0.019, 0.025, 0.004],
      ]),
      palette.dark,
      hand,
    );
    add(
      pieces,
      `${label} leg`,
      onLeg([
        [0.436, 0.049, 0.053],
        [0.561, 0.054, 0.064],
        [0.694, 0.07, 0.074],
        [0.79, 0.072, 0.075],
      ]),
      ink,
      upperLeg,
    );
    add(
      pieces,
      `${label} leggings`,
      onLeg([
        [0.265, 0.038, 0.041],
        [0.329, 0.045, 0.049],
        [0.468, 0.05, 0.053],
        [0.51, 0.045, 0.048],
      ]),
      undercloth,
      lowerLeg,
    );
    add(
      pieces,
      `${label} boot shaft`,
      onLeg([
        [0.106, 0.05, 0.064],
        [0.174, 0.049, 0.055],
        [0.272, 0.056, 0.058],
        [0.313, 0.064, 0.067],
      ]),
      ivory,
      lowerLeg,
    );
    add(
      pieces,
      `${label} boot cuff`,
      onLeg([
        [0.282, 0.061, 0.065],
        [0.321, 0.065, 0.069],
      ]),
      tint(ivory, '#f9f2e7', 0.4),
      lowerLeg,
    );
    add(
      pieces,
      `${label} boot`,
      onLeg([
        [0.018, 0.058, 0.098, 0.031],
        [0.063, 0.059, 0.098, 0.034],
        [0.118, 0.05, 0.077, 0.021],
        [0.16, 0.046, 0.056, 0.003],
      ]),
      ivory,
      foot,
    );
    add(
      pieces,
      `${label} sole`,
      onLeg([
        [0, 0.058, 0.101, 0.032],
        [0.03, 0.059, 0.102, 0.032],
      ]),
      soles,
      foot,
    );
  }
}

const ANGULAR_OPENING = [
  [0.04, -0.12],
  [0.101, -0.088],
  [0.124, -0.022],
  [0.096, 0.055],
  [0.025, 0.111],
  [-0.063, 0.096],
  [-0.117, 0.041],
  [-0.116, -0.052],
  [-0.06, -0.104],
] as const;

const ROUND_OPENING = [
  [0.026, -0.121],
  [0.093, -0.092],
  [0.121, -0.023],
  [0.105, 0.051],
  [0.046, 0.104],
  [-0.046, 0.104],
  [-0.105, 0.051],
  [-0.121, -0.023],
  [-0.084, -0.098],
] as const;

function addHood(pieces: AvatarPiece[], part: string, palette: AvatarPalette) {
  const angular = part === 'angular-hood';
  const soft = part === 'soft-hood';
  const scout = part === 'scout-hood';
  const points = angular ? ANGULAR_OPENING : ROUND_OPENING;
  const height = 1.491;
  function outline(zx: number, scaleX: number, scaleY: number, shiftX = 0, shiftY = 0, peak = 0): Ring {
    return points.map(([x, y]) => [
      x * scaleX + shiftX,
      height + y * scaleY + shiftY,
      zx + Math.max(0, y / 0.12) * peak,
    ]);
  }

  const fold = angular ? 1.44 : soft ? 1.36 : 1.29;
  const peak = scout ? 0.065 : angular ? 0.024 : 0.008;
  const outer = outline(0.12, soft ? 1.43 : 1.38, fold, 0.012, 0.008, peak);
  const lip = outline(0.16, 1.21, 1.18, 0.007, 0.001, peak);
  const opening = outline(0.151, 0.93, 0.92, 0.003, 0, peak * 0.52);
  const interior = outline(0.08, 0.81, 0.79, 0.002, -0.005);
  const inside = tint(palette.dark, '#111019', 0.68);
  const edge = soft ? palette.accent : tint(palette.primary, palette.secondary, 0.22);

  add(
    pieces,
    'Hood crown',
    loft(
      [
        outline(-0.139, 0.65, 0.78, angular ? -0.026 : -0.013, 0.015),
        outline(-0.067, 1.38, 1.46, angular ? -0.027 : -0.007, 0.028),
        outline(0.016, 1.47, 1.48, angular ? -0.021 : 0.006, 0.031),
        outer,
      ],
      true,
    ),
    palette.primary,
    'head',
  );
  add(pieces, 'Hood rim', loft([outer, lip]), edge, 'head');
  add(pieces, 'Hood inset bevel', loft([lip, opening]), palette.primary, 'head');
  add(pieces, 'Hood shadow well', loft([opening, interior]), tint(inside, palette.primary, 0.18), 'head');
  add(pieces, 'Faceless recess', loft([interior, outline(0.056, 0.5, 0.65)], false, true), inside, 'head');
}

function addHat(pieces: AvatarPiece[], palette: AvatarPalette) {
  const cowl = {
    ...palette,
    primary: tint(palette.primary, palette.dark, 0.47),
    secondary: palette.primary,
  };
  addHood(pieces, 'soft-hood', { ...cowl, accent: cowl.primary });

  const hatRing = (y: number, width: number, depth: number, x = 0, z = 0, warp = 0): Ring =>
    ellipse([y, width, depth, z], 9).map(([px, py, pz], index) => [px + x, py + warp * Math.cos(index * 2.4), pz]);
  add(
    pieces,
    'Hat underside',
    loft(
      [
        hatRing(1.568, 0.131, 0.119),
        hatRing(1.585, 0.234, 0.194, 0, -0.018, 0.016),
        hatRing(1.609, 0.333, 0.251, -0.012, -0.022, 0.038),
      ],
      true,
    ),
    tint(palette.primary, palette.dark, 0.56),
    'head',
  );
  add(
    pieces,
    'Angular hat brim',
    loft([
      hatRing(1.609, 0.333, 0.251, -0.012, -0.022, 0.038),
      hatRing(1.635, 0.292, 0.233, -0.007, -0.018, 0.034),
      hatRing(1.652, 0.151, 0.142, -0.014, -0.007),
    ]),
    palette.primary,
    'head',
  );
  add(
    pieces,
    'Hat band',
    loft([hatRing(1.652, 0.152, 0.143, -0.014, -0.007), hatRing(1.683, 0.146, 0.138, -0.016, -0.01)]),
    palette.accent,
    'head',
  );
  add(
    pieces,
    'Tilted hat crown',
    loft(
      [
        hatRing(1.682, 0.145, 0.137, -0.016, -0.01),
        hatRing(1.753, 0.095, 0.104, -0.044, -0.031, 0.011),
        hatRing(1.823, 0.052, 0.064, -0.082, -0.034, 0.008),
        hatRing(1.844, 0.019, 0.022, -0.128, -0.004),
      ],
      false,
      true,
    ),
    palette.primary,
    'head',
  );
  add(pieces, 'Hat clasp', jewel(-0.013, 1.676, 0.123, 0.031, 0.031, 0.023), palette.accent, 'head');
}

type Tunic = {
  shoulder: number;
  waist: number;
  hem: number;
  width: number;
  depth: number;
  panel: string;
};

function addTunic(pieces: AvatarPiece[], part: string, palette: AvatarPalette) {
  const profiles: Record<string, Tunic> = {
    'layered-combat-tunic': { shoulder: 0.239, waist: 0.145, hem: 0.646, width: 0.237, depth: 0.148, panel: '#e8dbcc' },
    'layered-robe': { shoulder: 0.192, waist: 0.143, hem: 0.496, width: 0.281, depth: 0.16, panel: palette.primary },
    'ceremonial-tunic': {
      shoulder: 0.201,
      waist: 0.146,
      hem: 0.544,
      width: 0.25,
      depth: 0.166,
      panel: palette.secondary,
    },
    'wide-hem-tunic': {
      shoulder: 0.194,
      waist: 0.143,
      hem: 0.511,
      width: 0.306,
      depth: 0.176,
      panel: palette.secondary,
    },
    'short-adventure-tunic': {
      shoulder: 0.193,
      waist: 0.137,
      hem: 0.681,
      width: 0.217,
      depth: 0.141,
      panel: '#e5d7bb',
    },
  };
  const fit = profiles[part];
  if (!fit) throw new Error(`Unknown tunic geometry: ${part}.`);
  const cloth = tint(fit.panel, palette.secondary, 0.42);
  const shadow = tint(cloth, palette.dark, 0.3);
  const edging = tint(palette.accent, cloth, 0.34);
  const hem = fit.hem;

  add(
    pieces,
    'Layered tunic bodice',
    garment([
      [0.912, fit.waist, 0.107],
      [1.028, fit.waist * 1.1, 0.124, 0.005],
      [1.199, fit.shoulder, 0.123],
      [1.261, fit.shoulder * 0.83, 0.097],
      [1.33, 0.082, 0.069],
    ]),
    cloth,
    'spine',
  );
  add(
    pieces,
    'Waist wrap',
    garment([
      [0.89, fit.waist * 1.1, 0.126, 0.005],
      [0.939, fit.waist * 1.07, 0.128, 0.007],
      [0.958, fit.waist * 1.03, 0.116, 0.007],
    ]),
    tint(palette.dark, palette.primary, 0.29),
    'hips',
  );
  add(pieces, 'Waist clasp', jewel(0.015, 0.925, 0.133, 0.034, 0.031, 0.017), edging, 'hips');

  add(
    pieces,
    'Undertunic',
    garment([
      [hem - 0.044, fit.width * 0.95, fit.depth * 0.96, 0.006],
      [hem + 0.053, fit.width * 0.92, fit.depth * 0.95, 0.003],
      [0.865, fit.waist * 1.1, 0.117],
      [0.925, fit.waist * 0.98, 0.116],
    ]),
    shadow,
    'hips',
  );
  const foldRing = (y: number, width: number, depth: number, fold: number): Ring =>
    ellipse([y, width, depth, 0.006], 9).map(([x, pointY, z], index) => [
      x * (index % 3 === 0 ? 1.06 : 0.99),
      pointY + Math.cos(index * 1.9) * fold,
      z * (index % 2 === 0 ? 1.05 : 1.0),
    ]);

  const hemLine = foldRing(hem + 0.029, fit.width, fit.depth, 0.026);
  add(
    pieces,
    'Faceted tunic folds',
    loft([
      hemLine,
      foldRing(hem + 0.059, fit.width * 0.96, fit.depth * 0.97, 0.024),
      foldRing((hem + 0.916) / 2, fit.width * 0.8, fit.depth * 0.97, 0.008),
      foldRing(0.912, fit.waist * 1.06, 0.119, 0.002),
    ]),
    cloth,
    'hips',
  );
  add(
    pieces,
    'Wrapped tunic hem',
    loft([foldRing(hem + 0.011, fit.width * 0.988, fit.depth * 0.985, 0.026), hemLine]),
    edging,
    'hips',
  );
  add(pieces, 'Cloth seal', jewel(0.002, hem + 0.142, fit.depth * 0.97 + 0.002, 0.023, 0.038, 0.009), edging, 'hips');
}

type MantleProfile = readonly [height: number, width: number, depth: number, z: number, fold: number];
type Mantle = {
  rows: readonly MantleProfile[];
  points: number;
};

function addMantle(pieces: AvatarPiece[], part: string, palette: AvatarPalette) {
  const styles: Record<string, Mantle> = {
    'triangular-mantle': {
      points: 8,
      rows: [
        [1.354, 0.094, 0.081, 0.0, 0.002],
        [1.293, 0.225, 0.138, -0.014, 0.015],
        [1.22, 0.319, 0.166, -0.015, 0.022],
        [1.151, 0.32, 0.174, -0.021, 0.077],
      ],
    },
    'faceted-mantle': {
      points: 10,
      rows: [
        [1.354, 0.094, 0.081, 0.0, 0.002],
        [1.293, 0.223, 0.139, -0.017, 0.015],
        [1.218, 0.332, 0.171, -0.02, 0.035],
        [1.13, 0.35, 0.181, -0.024, 0.105],
      ],
    },
    'flared-white-mantle': {
      points: 10,
      rows: [
        [1.353, 0.092, 0.083, 0.0, 0.002],
        [1.282, 0.191, 0.132, -0.01, 0.012],
        [1.126, 0.267, 0.171, -0.009, 0.037],
        [1.005, 0.337, 0.213, -0.011, 0.075],
      ],
    },
    'short-poncho': {
      points: 9,
      rows: [
        [1.346, 0.086, 0.078, 0.0, 0.003],
        [1.283, 0.196, 0.127, -0.011, 0.013],
        [1.188, 0.278, 0.156, -0.011, 0.034],
        [1.11, 0.285, 0.173, -0.008, 0.065],
      ],
    },
  };
  const style = styles[part];
  if (!style) throw new Error(`Unknown mantle geometry: ${part}.`);
  const rings = style.rows.map(([height, width, depth, z, fold]) =>
    ellipse([height, width, depth, z], style.points).map(
      ([x, y, pointZ], i): Point => [
        x * (1 + (i % 2) * 0.032),
        y + x * 0.11 + (Math.cos(i * 2.3) - 0.32) * fold,
        pointZ * (1 + (i % 2) * 0.075),
      ],
    ),
  );
  const lowest = geometryElement(rings, rings.length - 1);
  const edge = lowest.map(([x, y, z]): Point => [x * 1.016, y - 0.016, z * 1.018]);
  const inner = edge.map(([x, y, z]): Point => [x * 0.92, y + 0.012, z * 0.9]);
  add(pieces, 'Outer mantle', loft([...rings].reverse()), palette.primary, 'spine');
  add(pieces, 'Mantle edging', loft([inner, edge, lowest]), palette.accent, 'spine');
  const collar = geometryElement(rings, 0);
  const rim = collar.map(([x, y, z]): Point => [x * 0.95, y + 0.016, z * 0.95]);
  add(pieces, 'Mantle collar', loft([collar, rim]), tint(palette.primary, palette.accent, 0.38), 'spine');
  add(pieces, 'Mantle clasp', jewel(-0.005, 1.273, 0.127, 0.035, 0.028, 0.02), palette.accent, 'spine');
}

// Close a thin cloth panel so all sides render in browsers and in portable VRM.
function clothPanel(rows: Ring[]): BufferGeometry {
  const positions: number[] = [];
  const back = rows.map((row) => row.map(([x, y, z]): Point => [x, y, z - 0.012]));
  const last = rows.length - 1;
  const top = geometryElement(rows, 0);
  const bottom = geometryElement(rows, last);
  const backTop = geometryElement(back, 0);
  const backBottom = geometryElement(back, last);
  const width = top.length - 1;

  function quad(a: Point, b: Point, c: Point, d: Point) {
    triangle(positions, a, b, c);
    triangle(positions, a, c, d);
  }
  for (let row = 0; row < last; row++) {
    const frontUpper = geometryElement(rows, row);
    const frontLower = geometryElement(rows, row + 1);
    const backUpper = geometryElement(back, row);
    const backLower = geometryElement(back, row + 1);
    for (let i = 0; i < width; i++) {
      const edge = geometryElement(frontUpper, i);
      const next = geometryElement(frontUpper, i + 1);
      const lowerEdge = geometryElement(frontLower, i);
      const lowerNext = geometryElement(frontLower, i + 1);
      quad(edge, lowerEdge, lowerNext, next);
      quad(
        geometryElement(backUpper, i),
        geometryElement(backUpper, i + 1),
        geometryElement(backLower, i + 1),
        geometryElement(backLower, i),
      );
    }
    quad(
      geometryElement(frontLower, 0),
      geometryElement(frontUpper, 0),
      geometryElement(backUpper, 0),
      geometryElement(backLower, 0),
    );
    quad(
      geometryElement(frontUpper, width),
      geometryElement(frontLower, width),
      geometryElement(backLower, width),
      geometryElement(backUpper, width),
    );
  }
  for (let i = 0; i < width; i++) {
    quad(
      geometryElement(top, i),
      geometryElement(top, i + 1),
      geometryElement(backTop, i + 1),
      geometryElement(backTop, i),
    );
    quad(
      geometryElement(bottom, i + 1),
      geometryElement(bottom, i),
      geometryElement(backBottom, i),
      geometryElement(backBottom, i + 1),
    );
  }
  return surface(positions);
}

function addCape(pieces: AvatarPiece[], split: boolean, palette: AvatarPalette) {
  const rows: Ring[] = [
    [
      [-0.19, 1.259, -0.083],
      [-0.112, 1.303, -0.116],
      [0.015, 1.318, -0.13],
      [0.136, 1.312, -0.118],
      [0.236, 1.254, -0.09],
    ],
    [
      [-0.19, 1.184, -0.136],
      [-0.067, 1.173, -0.196],
      [0.06, 1.174, -0.182],
      [0.179, 1.164, -0.205],
      [0.293, 1.151, -0.154],
    ],
    [
      [-0.204, 1.022, -0.167],
      [-0.054, 0.972, -0.236],
      [0.117, 0.946, -0.22],
      [0.261, 0.927, -0.256],
      [0.378, 0.956, -0.207],
    ],
    [
      [-0.225, 0.814, -0.192],
      [-0.02, 0.742, -0.247],
      [0.162, 0.651, -0.232],
      [0.365, 0.534, -0.32],
      [0.516, 0.591, -0.255],
    ],
  ];
  const rear = tint(palette.primary, '#351324', 0.1);
  const rim = tint(palette.primary, palette.accent, 0.41);
  const sections = split
    ? [
        rows.map((row, i) =>
          i === rows.length - 1
            ? [geometryElement(row, 0), geometryElement(row, 1), [0.093, 0.691, -0.258] as Point]
            : row.slice(0, 3),
        ),
        rows.map((row, i) =>
          i === rows.length - 1
            ? [[0.224, 0.627, -0.258] as Point, geometryElement(row, 3), geometryElement(row, 4)]
            : row.slice(2),
        ),
      ]
    : [rows];
  for (const [index, panel] of sections.entries()) {
    const hem = geometryElement(panel, panel.length - 1);
    const edge = hem.map(([x, y, z]): Point => [x * 1.009, y - 0.024 + index * 0.004, z - 0.002]);
    add(pieces, `Cape cloth ${index + 1}`, clothPanel(panel), rear, 'spine');
    add(pieces, `Cape hem ${index + 1}`, clothPanel([hem, edge]), rim, 'spine');
  }

  // The fold wraps over the shoulder. Its diagonal front edge clears the fitted tunic.
  const fold: Ring[] = [
    [
      [-0.111, 1.32, 0.008],
      [-0.023, 1.343, -0.023],
      [0.07, 1.349, -0.061],
      [0.174, 1.341, -0.05],
      [0.255, 1.318, 0.006],
    ],
    [
      [-0.13, 1.273, 0.119],
      [-0.036, 1.285, 0.127],
      [0.084, 1.291, 0.124],
      [0.207, 1.279, 0.085],
      [0.289, 1.254, 0.088],
    ],
    [
      [-0.125, 1.227, 0.134],
      [-0.037, 1.202, 0.155],
      [0.091, 1.16, 0.151],
      [0.197, 1.128, 0.132],
      [0.281, 1.145, 0.104],
    ],
  ];
  const front = geometryElement(fold, fold.length - 1);
  const stitched = front.map(([x, y, z]): Point => [x + 0.004, y - 0.015, z + 0.001]);
  add(pieces, 'Draped shoulder fold', clothPanel(fold), palette.primary, 'spine');
  add(pieces, 'Shoulder fold edging', clothPanel([front, stitched]), rim, 'spine');
  add(pieces, 'Cape clasp', jewel(-0.085, 1.245, 0.145, 0.026, 0.029, 0.019), palette.accent, 'spine');
}

function addHalo(pieces: AvatarPiece[], palette: AvatarPalette) {
  const halo = new TorusGeometry(0.126, 0.012, 5, 18)
    .rotateX(-Math.PI / 2 + Math.PI / 15)
    .rotateZ(Math.PI / 14)
    .translate(0.016, 1.809, -0.003);
  add(pieces, 'Floating halo', halo, palette.accent, 'head', false, 0.19);
}

function addQuiver(pieces: AvatarPiece[], palette: AvatarPalette) {
  const bottom: Point = [-0.045, 0.876, -0.187];
  const lip: Point = [0.25, 1.318, -0.214];
  const leather = tint('#7f583d', palette.dark, 0.34);
  add(pieces, 'Quiver leather', rod(bottom, lip, 0.065, 0.043, 7), leather, 'spine');
  add(pieces, 'Quiver band', rod([0.23, 1.289, -0.213], lip, 0.07, 0.068, 7), palette.accent, 'spine');
  add(
    pieces,
    'Quiver lining',
    rod([0.249, 1.316, -0.214], [0.251, 1.321, -0.214], 0.048, 0.054, 7),
    palette.dark,
    'spine',
  );
  add(pieces, 'Quiver strap', rod([0.126, 1.269, 0.088], [-0.097, 0.986, 0.124], 0.013, 0.014, 5), leather, 'spine');
  for (let i = 0; i < 3; i++) {
    const x = 0.208 + i * 0.035;
    const y = 1.423 + (i % 2) * 0.044;
    const z = -0.214 - (i % 2) * 0.035;
    add(pieces, `Arrow shaft ${i + 1}`, rod([x, 1.294, z], [x + 0.074, y, z], 0.005, 0.005, 5), '#ab8058', 'spine');
    add(pieces, `Arrow fletching ${i + 1}`, jewel(x + 0.064, y - 0.013, z, 0.02, 0.04, 0.011), '#dfc7a1', 'spine');
  }
}

function addProp(pieces: AvatarPiece[], archetype: string, palette: AvatarPalette) {
  if (archetype === 'warrior') {
    const blade = garment(
      [
        [0, 0.006, 0.006],
        [0.122, 0.073, 0.024],
        [0.616, 0.073, 0.021],
        [0.67, 0.049, 0.016],
      ],
      4,
    )
      .rotateZ(-0.47)
      .translate(-1.014, 0.519, 0.064);
    add(pieces, 'Broad sword blade', blade, '#bfbec9', 'rightHand', true);
    add(
      pieces,
      'Sword quillons',
      rod([-0.783, 1.169, 0.066], [-0.634, 1.104, 0.066], 0.022, 0.026),
      palette.accent,
      'rightHand',
      true,
    );
    add(
      pieces,
      'Sword grip',
      rod([-0.711, 1.126, 0.065], [-0.638, 1.282, 0.065], 0.02, 0.019),
      '#4a3443',
      'rightHand',
      true,
    );
    add(pieces, 'Sword pommel', jewel(-0.638, 1.284, 0.065, 0.032, 0.038, 0.027), palette.accent, 'rightHand', true);
  } else if (archetype === 'mage') {
    add(
      pieces,
      'Crystal staff shaft',
      rod([0.75, 0.282, 0.078], [0.691, 1.526, 0.083], 0.027, 0.019),
      '#493653',
      'leftHand',
      true,
      0.19,
    );
    add(
      pieces,
      'Staff ferrule',
      rod([0.746, 0.282, 0.078], [0.742, 0.374, 0.078], 0.026),
      palette.accent,
      'leftHand',
      true,
    );
    for (const side of [-1, 1]) {
      add(
        pieces,
        `Crystal cradle ${side}`,
        rod([0.691, 1.505, 0.084], [0.692 + side * 0.088, 1.649, 0.083], 0.014, 0.031),
        palette.accent,
        'leftHand',
        true,
        0.19,
      );
    }
    add(pieces, 'Floating crystal', jewel(0.692, 1.756, 0.085, 0.084, 0.111, 0.07), '#79cde3', 'leftHand', true, 0.19);
  } else if (archetype === 'ranger') {
    const points: readonly Point[] = [
      [0.752, 0.709, 0.095],
      [0.845, 0.765, 0.096],
      [0.84, 0.923, 0.102],
      [0.724, 1.127, 0.105],
      [0.684, 1.22, 0.105],
      [0.722, 1.307, 0.104],
      [0.839, 1.506, 0.102],
      [0.846, 1.651, 0.096],
      [0.754, 1.705, 0.095],
    ];
    for (let i = 1; i < points.length; i++) {
      const radius = i === 1 || i === points.length - 1 ? 0.009 : 0.017;
      add(
        pieces,
        `Bow stave ${i}`,
        rod(geometryElement(points, i - 1), geometryElement(points, i), radius, 0.017),
        '#84523a',
        'leftHand',
        true,
      );
    }
    add(pieces, 'Bow grip', rod([0.708, 1.161, 0.105], [0.708, 1.273, 0.105], 0.025), palette.dark, 'leftHand', true);
    add(
      pieces,
      'Bowstring',
      rod(geometryElement(points, 0), geometryElement(points, points.length - 1), 0.004, 0.004, 4),
      '#d1bc9c',
      'leftHand',
      true,
    );
  }
}

export function buildFacelessAvatar(recipe: AvatarRecipe, palette: AvatarPalette): AvatarPiece[] {
  const pieces: AvatarPiece[] = [];
  const parts = recipe.parts;
  const { headwear, torso, outerwear } = parts;
  if (!headwear || !torso || !outerwear) throw new Error('The outfit is missing a required slot.');

  addBody(pieces, palette, headwear);
  addTunic(pieces, torso, palette);
  if (headwear === 'wide-brim-hat') {
    addHat(pieces, palette);
  } else {
    addHood(pieces, headwear, palette);
  }
  if (outerwear === 'asymmetric-long-cape' || outerwear === 'split-cape') {
    addCape(pieces, outerwear === 'split-cape', palette);
  } else {
    addMantle(pieces, outerwear, palette);
  }
  if (parts['head-accessory'] === 'floating-halo') addHalo(pieces, palette);
  if (parts['back-accessory'] === 'quiver') addQuiver(pieces, palette);
  addProp(pieces, recipe.archetypeId, palette);

  return pieces;
}
