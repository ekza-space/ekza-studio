'use client';

import { type JSX, useCallback, useEffect, useRef, useState } from 'react';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  CylinderGeometry,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  RingGeometry,
  Scene,
  ShadowMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import styles from './AvatarBuilder.module.css';
import type { BoneName } from './rig';
import { type AvatarRecipe, buildAvatar, getRig } from './style';

export const PREVIEW_MOTIONS = ['Pose', 'Idle', 'Walk'] as const;
export type PreviewMotion = (typeof PREVIEW_MOTIONS)[number];

// A common stage scale keeps the camera, pedestal and lights stable across rigs.
const STAGE_HEIGHT = 1.74;
const FRONT = new Vector3(0.34, 0.13, 1).normalize();
const CAMERA_TARGET = new Vector3(0, STAGE_HEIGHT * 0.43, 0);

function isRenderable(object: Object3D): object is Mesh | GridHelper {
  return object instanceof Mesh || object instanceof GridHelper;
}

function disposeObjects(group: Group | Scene): void {
  group.traverse((object) => {
    if (!isRenderable(object)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
}

function createPedestal(): Group {
  const platform = new Group();
  const radius = STAGE_HEIGHT * 0.43;
  const top = new Mesh(
    new CylinderGeometry(radius, radius * 1.015, 0.085, 12),
    new MeshStandardMaterial({ color: '#57564e', flatShading: true, roughness: 0.94 }),
  );
  top.position.y = -0.0525;
  top.castShadow = true;
  top.receiveShadow = true;
  platform.add(top);

  const base = new Mesh(
    new CylinderGeometry(radius * 1.015, radius * 0.96, 0.12, 12),
    new MeshStandardMaterial({ color: '#3f3e37', flatShading: true, roughness: 0.94 }),
  );
  base.position.y = -0.155;
  base.castShadow = true;
  base.receiveShadow = true;
  platform.add(base);

  const edge = new Mesh(
    new RingGeometry(radius * 0.85, radius * 0.856, 12),
    new MeshBasicMaterial({ color: '#88816b', transparent: true, opacity: 0.59 }),
  );
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = -0.008;
  platform.add(edge);

  const grid = new GridHelper(12, 30, '#535448', '#535448');
  grid.position.y = -0.23;
  grid.material.transparent = true;
  grid.material.opacity = 0.27;
  platform.add(grid);

  const shadow = new Mesh(new PlaneGeometry(12, 12), new ShadowMaterial({ opacity: 0.43 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.224;
  shadow.receiveShadow = true;
  platform.add(shadow);

  return platform;
}

type PreviewRig = {
  readonly bones: ReadonlyMap<BoneName, Group>;
  readonly hipsY: number;
  readonly height: number;
};

function setLocalRigPose({ bones, hipsY, height }: PreviewRig, motion: PreviewMotion, time: number): void {
  const step = motion === 'Walk' ? Math.sin(time * Math.PI * 2 * 1.28) : 0;
  const idle = motion === 'Idle' ? Math.sin(time * Math.PI * 0.78) : 0;
  const hips = bones.get('hips');
  if (hips !== undefined) {
    hips.position.y = hipsY + Math.abs(step) * height * 0.016 + idle * height * 0.002;
    hips.rotation.y = step * 0.047;
  }
  const chest = bones.get('spine');
  if (chest !== undefined) {
    chest.rotation.x = idle * 0.024;
    chest.rotation.y = step * -0.055 + idle * 0.015;
  }
  for (const side of ['left', 'right'] as const) {
    const arm = bones.get(`${side}UpperArm`);
    const forearm = bones.get(`${side}LowerArm`);
    const sideSign = side === 'left' ? 1 : -1;
    const sideStep = sideSign * step;
    if (arm !== undefined) {
      const armSign = Math.sign(forearm?.position.x ?? arm.position.x) || sideSign;
      arm.rotation.z = -armSign * (1.13 + idle * 0.023);
      arm.rotation.x = sideStep * 0.19;
    }
    if (forearm !== undefined) forearm.rotation.x = -0.12 - Math.max(0, sideStep) * 0.11;

    const thigh = bones.get(`${side}UpperLeg`);
    if (thigh !== undefined) thigh.rotation.x = -sideStep * 0.36;
    const shin = bones.get(`${side}LowerLeg`);
    if (shin !== undefined) shin.rotation.x = Math.max(0, -sideStep) * 0.37;
    const foot = bones.get(`${side}Foot`);
    if (foot !== undefined) foot.rotation.x = Math.max(0, sideStep) * 0.12;
  }
}

function createPreview(host: HTMLDivElement, onContextLoss: (lost: boolean) => void) {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.32;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.append(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(31, 1, 0.02, 35);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(CAMERA_TARGET);
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minPolarAngle = Math.PI * 0.12;
  controls.minDistance = STAGE_HEIGHT * 1.45;
  controls.maxDistance = STAGE_HEIGHT * 5;
  let hasFramed = false;

  scene.add(createPedestal());
  scene.add(new AmbientLight('#fff4df', 0.42));
  scene.add(new HemisphereLight('#dde7ff', '#4c483b', 1.65));

  const key = new DirectionalLight('#fff1d8', 3.15);
  key.position.set(-3, 5.7, 4);
  key.target.position.set(0, STAGE_HEIGHT * 0.32, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -2.4;
  key.shadow.camera.right = 2.4;
  key.shadow.camera.bottom = -2.4;
  key.shadow.camera.top = 2.4;
  key.shadow.normalBias = 0.017;
  key.shadow.bias = -0.00004;
  scene.add(key, key.target);
  const rim = new DirectionalLight('#bac6e8', 1.95);
  rim.position.set(2.2, 3.5, -4.5);
  scene.add(rim);

  let avatar: Group | null = null;
  let previewRig: PreviewRig | null = null;
  let motion: PreviewMotion = 'Pose';
  let start = performance.now();
  let frame = 0;
  let invalidated = true;
  let contextLost = false;
  const invalidate = (): void => {
    invalidated = true;
  };
  const render = (now: number): void => {
    if (!contextLost && (invalidated || motion !== 'Pose')) {
      if (previewRig !== null) setLocalRigPose(previewRig, motion, (now - start) / 1000);
      renderer.render(scene, camera);
      invalidated = false;
    }
    frame = requestAnimationFrame(render);
  };
  const resize = (): void => {
    const { width, height } = host.getBoundingClientRect();
    if (width < 2 || height < 2) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    if (!hasFramed) {
      camera.position.copy(CAMERA_TARGET).addScaledVector(FRONT, STAGE_HEIGHT * (camera.aspect < 0.77 ? 2.52 : 2.29));
      hasFramed = true;
    }
    camera.updateProjectionMatrix();
    controls.update();
    invalidate();
  };
  const lost = (event: Event): void => {
    event.preventDefault();
    contextLost = true;
    onContextLoss(true);
  };
  const restored = (): void => {
    contextLost = false;
    onContextLoss(false);
    invalidate();
  };
  controls.addEventListener('change', invalidate);
  renderer.domElement.addEventListener('webglcontextlost', lost);
  renderer.domElement.addEventListener('webglcontextrestored', restored);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  frame = requestAnimationFrame(render);

  return {
    setAvatar(recipe: AvatarRecipe): void {
      const joints = getRig(recipe);
      const origins = new Map(joints.map(({ name, position }) => [name, new Vector3(...position)]));
      const nextAvatar = new Group();
      const nextBones = new Map<BoneName, Group>();
      for (const joint of joints) {
        const bone = new Group();
        bone.position.fromArray(joint.position);
        const parent = joint.parent === null ? null : (nextBones.get(joint.parent) ?? null);
        if (parent !== null && joint.parent !== null) {
          const parentOrigin = origins.get(joint.parent);
          if (parentOrigin !== undefined) bone.position.sub(parentOrigin);
        }
        (parent ?? nextAvatar).add(bone);
        nextBones.set(joint.name, bone);
      }
      let bodyBottom = Infinity;
      let bodyTop = -Infinity;
      for (const piece of buildAvatar(recipe)) {
        const origin = origins.get(piece.bone);
        const bone = nextBones.get(piece.bone);
        if (origin === undefined || bone === undefined) {
          piece.geometry.dispose();
          continue;
        }
        if (!piece.previewOnly) {
          piece.geometry.computeBoundingBox();
          const bounds = piece.geometry.boundingBox;
          if (bounds !== null && !bounds.isEmpty()) {
            bodyBottom = Math.min(bodyBottom, bounds.min.y);
            bodyTop = Math.max(bodyTop, bounds.max.y);
          }
        }
        const material = new MeshStandardMaterial({ color: piece.color, roughness: 0.9, flatShading: true });
        if (piece.previewGlow !== undefined) {
          material.emissive.set(piece.color);
          material.emissiveIntensity = piece.previewGlow;
        }
        const mesh = new Mesh(piece.geometry, material);
        mesh.name = piece.name;
        mesh.position.copy(origin).negate();
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        bone.add(mesh);
      }
      const floor = Number.isFinite(bodyBottom) ? bodyBottom : 0;
      const headY = origins.get('head')?.y ?? bodyTop;
      const measuredHeight = (headY - floor) * 1.2;
      const height = Number.isFinite(measuredHeight) && measuredHeight > 0 ? measuredHeight : STAGE_HEIGHT;
      const scale = STAGE_HEIGHT / height;
      nextAvatar.scale.setScalar(scale);
      nextAvatar.position.y = -floor * scale;
      if (avatar !== null) {
        scene.remove(avatar);
        disposeObjects(avatar);
      }
      avatar = nextAvatar;
      previewRig = { bones: nextBones, hipsY: nextBones.get('hips')?.position.y ?? 0, height };
      scene.add(avatar);
      invalidate();
    },
    setMotion(next: PreviewMotion): void {
      motion = next;
      start = performance.now();
      invalidate();
    },
    resetCamera(): void {
      camera.position.copy(CAMERA_TARGET).addScaledVector(FRONT, STAGE_HEIGHT * (camera.aspect < 0.77 ? 2.52 : 2.29));
      controls.target.copy(CAMERA_TARGET);
      controls.update();
      invalidate();
    },
    dispose(): void {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener('change', invalidate);
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      renderer.domElement.removeEventListener('webglcontextrestored', restored);
      key.shadow.map?.dispose();
      disposeObjects(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export function Preview({
  recipe,
  motion,
}: {
  readonly recipe: AvatarRecipe;
  readonly motion: PreviewMotion;
}): JSX.Element {
  const runtime = useRef<ReturnType<typeof createPreview> | null>(null);
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [modelError, setModelError] = useState(false);

  const attachPreview = useCallback((host: HTMLDivElement | null) => {
    if (host === null) return undefined;
    let preview: ReturnType<typeof createPreview>;
    try {
      preview = createPreview(host, (lost) => {
        setRendererError(lost ? 'The 3D connection was interrupted.' : null);
      });
      runtime.current = preview;
      setRendererError(null);
    } catch {
      setRendererError('3D preview is unavailable in this browser.');
      return undefined;
    }
    return () => {
      runtime.current = null;
      preview.dispose();
    };
  }, []);
  useEffect(() => {
    const preview = runtime.current;
    if (preview === null) return undefined;
    // Cancel geometry work when a new selection replaces it before the next frame.
    const frame = requestAnimationFrame(() => {
      try {
        preview.setAvatar(recipe);
        setModelError(false);
      } catch {
        setModelError(true);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [recipe]);
  useEffect(() => {
    runtime.current?.setMotion(motion);
  }, [motion]);

  return (
    <>
      <div className={styles.canvas} ref={attachPreview} />
      {rendererError !== null || modelError ? (
        <output className={styles.previewFallback}>
          <strong>{rendererError ?? 'This character could not be previewed.'}</strong>
          <span>You can still edit and download your recipe.</span>
        </output>
      ) : (
        <button type="button" className={styles.resetView} onClick={() => runtime.current?.resetCamera()}>
          Reset view
        </button>
      )}
    </>
  );
}
