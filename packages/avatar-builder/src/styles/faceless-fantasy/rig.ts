import { type BoneName, type RigJoint, VRM_BONES } from '../../rig';

/** World bind positions in metres, in the VRM 1.0 +Z-facing T-pose. */
const positions: Record<BoneName, RigJoint['position']> = {
  hips: [0, 0.79, 0],
  spine: [0, 1.04, 0],
  head: [0, 1.45, 0],
  leftUpperArm: [0.21, 1.22, 0],
  leftLowerArm: [0.44, 1.22, 0],
  leftHand: [0.64, 1.22, 0],
  rightUpperArm: [-0.21, 1.22, 0],
  rightLowerArm: [-0.44, 1.22, 0],
  rightHand: [-0.64, 1.22, 0],
  leftUpperLeg: [0.1, 0.76, 0],
  leftLowerLeg: [0.1, 0.47, 0],
  leftFoot: [0.1, 0.14, 0],
  rightUpperLeg: [-0.1, 0.76, 0],
  rightLowerLeg: [-0.1, 0.47, 0],
  rightFoot: [-0.1, 0.14, 0],
};

export const facelessRig: readonly RigJoint[] = VRM_BONES.map(({ name, parent }) => ({
  name,
  parent,
  position: positions[name],
}));
