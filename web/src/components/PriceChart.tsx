import type { PricePoint } from '../lib/types';

/** Minimal dependency-free SVG sparkline of YES price (0–100¢ domain). */
export default function PriceChart({ history }: { history: PricePoint[] }) {
  const pts = (history ?? []).slice(-100);
  if (pts.length < 2)
    return (
      <div className="grid h-24 place-items-center text-xs text-ink/30">
        Not enough price history yet
      </div>
    );

  const W = 600;
  const H = 96;
  const pad = 6;
  const xFor = (i: number) => pad + (i / (pts.length - 1)) * (W - 2 * pad);
  const yFor = (y: number) => pad + (1 - y / 100) * (H - 2 * pad);
  const d = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(p.y).toFixed(1)}`)
    .join(' ');
  const up = pts[pts.length - 1].y >= pts[0].y;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" preserveAspectRatio="none">
      <line
        x1={pad}
        x2={W - pad}
        y1={yFor(50)}
        y2={yFor(50)}
        stroke="currentColor"
        className="text-ink/10"
        strokeDasharray="3 4"
      />
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        className={up ? 'text-yes' : 'text-no'}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
