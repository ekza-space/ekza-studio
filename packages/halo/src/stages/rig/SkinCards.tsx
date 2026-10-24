// The Skin cards of the Rig stage (STUDIO-TOUCH-SPEC §4.2 E, §6.2 *Skin spot*, §12.4 steps 2–3; T9):
// - *Who owns this?* beside a finger held on the skin: the bones that spot follows with their weights there (the top
//   three), each a chip that paints that bone (Skin, that bone as the one painting goes to, the brush: J7's one tap),
//   *Smooth here* (the Smooth brush on that bone) and ⋯ More (the skin spot's More: Set weight…, Hold, Mirror
//   weights, Prune);
// - while the brush paints, *This area follows*: the bone painting goes to, the others of the spot the session
//   started from (a tap swaps), ‹ › to walk the bone list and *All bones* — docked to the right edge, a tray row on
//   phones (§4.4).
import type { MeshId } from '@ekza-studio/doc';
import { Cluster, TouchButton, TouchIconButton } from '@ekza-studio/ui/touch';
import type { JSX } from 'react';
import { Icon } from '../../halo/icons';
import { rigWords } from '../../i18n/rig';
import type { HaloController } from '../../shell/controller';
import { type SizeClass, useDocumentVersion, useSessionValue } from '../../shell/hooks';
import type { Noun } from '../../verbs/nouns';
import { activeBone, boneLabel, bonesAt } from './model';
import type { RigStage } from './start';
import { aboveTray } from './dock';
import { type SkinSpot, useRigUi } from './ui';

const w = rigWords;

/** The noun of a skin spot (its ⋯ More). */
export function spotNoun(controller: HaloController, spot: SkinSpot): Noun {
  return {
    kind: 'skinSpot',
    id: spot.mesh,
    ids: [spot.mesh],
    label: w.owns.spot,
    count: 1,
    character: controller.ctx.app.session.getState().rig.character,
  };
}

async function paint(controller: HaloController, mesh: MeshId, joint: string): Promise<void> {
  const { ctx } = controller;
  const { paintBone } = await import('../../recipes/fixBend');
  await paintBone((op, a) => ctx.run(op, a), ctx.app, mesh, joint);
}

export function OwnsCard({
  controller,
  rig,
  spot,
  size,
}: {
  readonly controller: HaloController;
  readonly rig: RigStage;
  readonly spot: SkinSpot;
  readonly size: SizeClass;
}): JSX.Element {
  const { ctx } = controller;
  const { app } = ctx;
  useDocumentVersion(app);
  const bones = bonesAt(app, spot.mesh, spot.point, 3);
  const frame = typeof window === 'undefined' ? { w: 1024, h: 768 } : { w: window.innerWidth, h: window.innerHeight };
  const width = Math.min(320, frame.w - 32);
  const right = spot.at.x + 24 + width < frame.w - 16;
  const left = right ? spot.at.x + 24 : Math.max(16, spot.at.x - 24 - width);
  const top = Math.min(Math.max(96, spot.at.y - 60), frame.h - 300);
  const compact = size === 'compact';
  const trayHeight = useRigUi(rig.ui, (s) => s.trayHeight);
  const pickBone = (joint: string): void => {
    rig.touch();
    rig.ui.set({ spot: null, follows: spot });
    void paint(controller, spot.mesh, joint);
  };
  return (
    <Cluster
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a card of controls beside the work, not a form
      role="group"
      aria-label={w.owns.title}
      data-halo-chrome=""
      data-testid="halo-rig-owns"
      data-mesh={spot.mesh}
      data-point={spot.point}
      className="pointer-events-auto absolute flex flex-col gap-2 p-3"
      style={compact ? { left: 16, right: 16, bottom: aboveTray(trayHeight, size) } : { left, top, width }}
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold">{w.owns.title}</span>
        <span className="flex-1" />
        <TouchIconButton
          label={rigWords.card.close}
          icon={<Icon name="close" />}
          className="border-0 bg-transparent shadow-none"
          onClick={() => rig.ui.set({ spot: null })}
        />
      </div>
      {bones.length === 0 ? (
        <p className="m-0 text-fg-2">{w.owns.none}</p>
      ) : (
        <>
          <p className="m-0 text-touch-label text-fg-2">{w.owns.tapBone}</p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {bones.map((bone) => (
              <li key={bone.joint} className="flex">
                <TouchButton
                  className="justify-between gap-3"
                  data-testid={`halo-rig-owner-${bone.joint}`}
                  data-weight={bone.weight.toFixed(3)}
                  onClick={() => pickBone(bone.joint)}
                >
                  <span className="truncate">{bone.label}</span>
                  <span className="tabular-nums text-fg-2">{bone.weight.toFixed(2)}</span>
                </TouchButton>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex flex-wrap gap-1.5">
        <TouchButton
          variant="ghost"
          disabled={bones.length === 0}
          data-testid="halo-rig-smooth-here"
          onClick={() => {
            const top3 = bones[0];
            if (top3 === undefined) return;
            pickBone(top3.joint);
            void ctx.run('skin.paint.set', { patch: { op: 'smooth' } });
          }}
        >
          {w.owns.smoothHere}
        </TouchButton>
        <span className="flex-1" />
        <TouchButton
          variant="ghost"
          aria-label={w.owns.more}
          data-testid="halo-rig-owns-more"
          onClick={() => {
            rig.touch();
            rig.ui.set({ spot: null });
            ctx.store.set({ sheet: 'more', sheetArgs: null, sheetNoun: spotNoun(controller, spot), halo: null });
          }}
        >
          <Icon name="more" />
        </TouchButton>
      </div>
    </Cluster>
  );
}

export function FollowsCard({
  controller,
  rig,
  size,
}: {
  readonly controller: HaloController;
  readonly rig: RigStage;
  readonly size: SizeClass;
}): JSX.Element | null {
  const { ctx } = controller;
  const { app } = ctx;
  useDocumentVersion(app);
  useSessionValue(app, (s) => s.rig.activeInfluence);
  const follows = useRigUi(rig.ui, (s) => s.follows);
  const trayHeight = useRigUi(rig.ui, (s) => s.trayHeight);
  const active = activeBone(app);
  const compact = size === 'compact';
  const others =
    follows === null ? [] : bonesAt(app, follows.mesh, follows.point, 4).filter((b) => b.joint !== active?.joint);
  const activeWeight =
    follows === null || active === null
      ? null
      : (bonesAt(app, follows.mesh, follows.point, 4).find((b) => b.joint === active.joint)?.weight ?? 0);
  return (
    <Cluster
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a card of controls beside the work, not a form
      role="group"
      aria-label={w.paint.follows}
      data-halo-chrome=""
      data-testid="halo-rig-follows"
      className={`pointer-events-auto absolute flex gap-2 p-3 ${compact ? 'flex-row flex-wrap items-center' : 'flex-col'}`}
      style={
        compact
          ? { left: 16, right: 16, bottom: aboveTray(trayHeight, size) }
          : { right: 'var(--touch-inset-right)', top: size === 'regular' ? 196 : 140, width: 280 }
      }
    >
      <span className="text-touch-label text-fg-2">{w.paint.follows}</span>
      {active === null ? (
        <span className="text-fg-2">{w.paint.pickBone}</span>
      ) : (
        <div className="flex items-center gap-1" data-testid="halo-rig-active-bone" data-joint={active.joint}>
          <TouchIconButton
            label={w.paint.previous}
            icon={<Icon name="left" />}
            className="border-0 bg-transparent shadow-none"
            onClick={() => {
              rig.touch();
              void ctx.run('skin.influence.walk', { direction: 'up' });
            }}
          />
          <span className="min-w-0 flex-1 truncate font-semibold">
            ● {boneLabel(app, active.joint)}
            {activeWeight === null ? '' : ` ${activeWeight.toFixed(2)}`}
          </span>
          <TouchIconButton
            label={w.paint.next}
            icon={<Icon name="right" />}
            className="border-0 bg-transparent shadow-none"
            onClick={() => {
              rig.touch();
              void ctx.run('skin.influence.walk', { direction: 'down' });
            }}
          />
        </div>
      )}
      {others.map((bone) => (
        <TouchButton
          key={bone.joint}
          variant="ghost"
          className="justify-between gap-3"
          data-testid={`halo-rig-follows-${bone.joint}`}
          onClick={() => {
            rig.touch();
            if (follows !== null) void ctx.run('skin.influence.setActive', { mesh: follows.mesh, joint: bone.joint });
          }}
        >
          <span className="truncate">○ {bone.label}</span>
          <span className="tabular-nums text-fg-2">{bone.weight.toFixed(2)}</span>
        </TouchButton>
      ))}
      <TouchButton
        variant="ghost"
        className="gap-1"
        data-testid="halo-rig-all-bones"
        onClick={() => {
          rig.touch();
          ctx.store.set({ sheet: 'bones', sheetArgs: null, sheetNoun: null, halo: null });
        }}
      >
        {w.paint.allBones}
        <Icon name="right" size={16} />
      </TouchButton>
    </Cluster>
  );
}
