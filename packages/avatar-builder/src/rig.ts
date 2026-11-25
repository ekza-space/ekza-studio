/** World bind positions, in metres, in the VRM 1.0 +Z-facing T-pose. */
export const JOINTS = [
  { name: 'hips', parent: null, position: [0, 0.79, 0] },
  { name: 'spine', parent: 'hips', position: [0, 1.04, 0] },
  { name: 'head', parent: 'spine', position: [0, 1.45, 0] },
  { name: 'leftUpperArm', parent: 'spine', position: [0.21, 1.22, 0] },
  { name: 'leftLowerArm', parent: 'leftUpperArm', position: [0.44, 1.22, 0] },
  { name: 'leftHand', parent: 'leftLowerArm', position: [0.64, 1.22, 0] },
  { name: 'rightUpperArm', parent: 'spine', position: [-0.21, 1.22, 0] },
  { name: 'rightLowerArm', parent: 'rightUpperArm', position: [-0.44, 1.22, 0] },
  { name: 'rightHand', parent: 'rightLowerArm', position: [-0.64, 1.22, 0] },
  { name: 'leftUpperLeg', parent: 'hips', position: [0.1, 0.76, 0] },
  { name: 'leftLowerLeg', parent: 'leftUpperLeg', position: [0.1, 0.47, 0] },
  { name: 'leftFoot', parent: 'leftLowerLeg', position: [0.1, 0.14, 0] },
  { name: 'rightUpperLeg', parent: 'hips', position: [-0.1, 0.76, 0] },
  { name: 'rightLowerLeg', parent: 'rightUpperLeg', position: [-0.1, 0.47, 0] },
  { name: 'rightFoot', parent: 'rightLowerLeg', position: [-0.1, 0.14, 0] },
] as const;

export type BoneName = (typeof JOINTS)[number]['name'];
