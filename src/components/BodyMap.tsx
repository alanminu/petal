import type { KeyboardEvent, ReactNode } from 'react';
import { PAIN_REGIONS } from '../lib/insights';
import type { PainLevel } from '../types';
import { PAIN_LABELS } from '../types';

type Levels = Record<string, PainLevel>;

// Simple shapes on a 120 × 250 grid; each region is one or two rounded rectangles.
const SHAPES: Record<string, [x: number, y: number, w: number, h: number, r: number][]> = {
  head: [[43, 6, 34, 34, 17]],
  breasts: [[30, 50, 60, 32, 14]],
  stomach: [[33, 85, 54, 28, 9]],
  abdomen: [[30, 116, 60, 30, 13]],
  thighs: [[31, 150, 27, 46, 12], [62, 150, 27, 46, 12]],
  shoulders: [[26, 44, 68, 19, 9.5]],
  upperback: [[30, 66, 60, 34, 9]],
  lowerback: [[33, 103, 54, 24, 9]],
  hips: [[30, 130, 60, 27, 13]],
  legs: [[31, 161, 27, 80, 12], [62, 161, 27, 80, 12]],
};

const DECOR: Record<'front' | 'back', [number, number, number, number, number][]> = {
  front: [[53, 38, 14, 12, 4], [13, 54, 13, 76, 6.5], [94, 54, 13, 76, 6.5], [34, 200, 21, 42, 10], [65, 200, 21, 42, 10]],
  back: [[43, 6, 34, 34, 17], [13, 54, 13, 76, 6.5], [94, 54, 13, 76, 6.5]],
};

const rects = (list: [number, number, number, number, number][]) =>
  list.map(([x, y, w, h, r], i) => <rect key={i} x={x} y={y} width={w} height={h} rx={r} />);

function Figure({ side, levels, onTap }: { side: 'front' | 'back'; levels: Levels; onTap?(id: string): void }) {
  const regions: ReactNode[] = PAIN_REGIONS.filter((r) => r.side === side).map((r) => {
    const level = levels[r.id] ?? 0;
    const name = `${r.label}: ${level ? PAIN_LABELS[level].toLowerCase() : 'none'}`;
    if (!onTap) {
      return (
        <g key={r.id} className={`region level-${level}`}>
          <title>{name}</title>
          {rects(SHAPES[r.id])}
        </g>
      );
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onTap(r.id);
      }
    };
    return (
      <g key={r.id} className={`region is-tappable level-${level}`} role="button" tabIndex={0} aria-label={name} onClick={() => onTap(r.id)} onKeyDown={onKey}>
        {rects(SHAPES[r.id])}
      </g>
    );
  });
  return (
    <figure className="body-figure">
      <svg viewBox="0 0 120 250" role={onTap ? 'group' : 'img'} aria-label={`${side} of body`}>
        <g className="body-decor">{rects(DECOR[side])}</g>
        {regions}
      </svg>
      <figcaption>{side === 'front' ? 'Front' : 'Back'}</figcaption>
    </figure>
  );
}

/** Front and back body outline. Tapping a region steps it through mild, moderate, strong, off. */
export function BodyMap({ levels, onChange }: { levels: Levels; onChange?(next: Levels): void }) {
  const tap = onChange
    ? (id: string) => {
        const next = { ...levels };
        const level = ((levels[id] ?? 0) + 1) % 4;
        if (level === 0) delete next[id];
        else next[id] = level as PainLevel;
        onChange(next);
      }
    : undefined;
  return (
    <div className="body-map">
      <Figure side="front" levels={levels} onTap={tap} />
      <Figure side="back" levels={levels} onTap={tap} />
    </div>
  );
}
