/** Humanoid hierarchy supported by builder exports and the preview motions. */
export const VRM_BONES = [
  { name: 'hips', parent: null },
  { name: 'spine', parent: 'hips' },
  { name: 'head', parent: 'spine' },
  { name: 'leftUpperArm', parent: 'spine' },
  { name: 'leftLowerArm', parent: 'leftUpperArm' },
  { name: 'leftHand', parent: 'leftLowerArm' },
  { name: 'rightUpperArm', parent: 'spine' },
  { name: 'rightLowerArm', parent: 'rightUpperArm' },
  { name: 'rightHand', parent: 'rightLowerArm' },
  { name: 'leftUpperLeg', parent: 'hips' },
  { name: 'leftLowerLeg', parent: 'leftUpperLeg' },
  { name: 'leftFoot', parent: 'leftLowerLeg' },
  { name: 'rightUpperLeg', parent: 'hips' },
  { name: 'rightLowerLeg', parent: 'rightUpperLeg' },
  { name: 'rightFoot', parent: 'rightLowerLeg' },
] as const;

export type BoneName = (typeof VRM_BONES)[number]['name'];

export type RigJoint = {
  readonly name: BoneName;
  readonly parent: BoneName | null;
  readonly position: readonly [number, number, number];
};
