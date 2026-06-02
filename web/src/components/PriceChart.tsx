import { useRef, useState } from 'react';
import type { PricePoint } from '../lib/types';
import { formatPSTShort } from '../lib/time';

// Dependency-free interactive sparkline: labeled Y axis (¢), time X axis, hover crosshair + tooltip.
const W = 640;
const H = 200;
const PAD_L = 30;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 24;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const GRID = [0, 25, 50, 75, 100];

export default function PriceChart({ history }: { history: PricePoint[] }) {
  const pts = (history ?? []).slice(-120);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  if (pts.length < 2) {
    return (
      <div className="grid h-40 place-items-center text-xs text-ink/30">
        Not enough price history yet — trades will plot here.
      </div>
    );
  }

  const n = pts.length;
  const xAt = (i: number) => PAD_L + (n === 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  const yAt = (v: number) => PAD_T + (1 - v / 100) * PLOT_H;
  const linePath = pts.map((p, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(p.y).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${xAt(n - 1).toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} L${xAt(0).toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} Z`;
  const up = pts[n - 1].y >= pts[0].y;
  const color = up ? '#0E9F6E' : '#E5484D';
  const gradId = up ? 'pcUp' : 'pcDown';

  const onMove = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * W;
    let idx = Math.round(((vbX - PAD_L) / PLOT_W) * (n - 1));
    idx = Math.max(0, Math.min(n - 1, idx));
    setHover(idx);
  };

  const hv = hover != null ? pts[hover] : null;
  const tipLeft = hover != null ? Math.min(94, Math.max(6, (xAt(hover) / W) * 100)) : 0;

  return (
    <div className="relative">
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-ink/45">
        <span className="font-semibold uppercase tracking-wider">YES price over time</span>
        <span className="tnum">{pts[n - 1].y.toFixed(0)}¢ now</span>
      </div>

      {/* aspect matches the 640x200 viewBox so there's no letterbox → hover maps exactly */}
      <div className="aspect-[16/5] w-full">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-full w-full touch-none"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="pcUp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0E9F6E" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#0E9F6E" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="pcDown" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E5484D" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#E5484D" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Y gridlines + ¢ labels */}
          {GRID.map((v) => (
            <g key={v}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={yAt(v)}
                y2={yAt(v)}
                stroke="currentColor"
                className="text-ink/10"
                strokeDasharray={v === 50 ? '0' : '3 4'}
              />
              <text
                x={PAD_L - 6}
                y={yAt(v) + 3}
                textAnchor="end"
                className="fill-current text-ink/40"
                fontSize="10"
              >
                {v}¢
              </text>
            </g>
          ))}

          <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* X axis end times */}
          <text x={PAD_L} y={H - 7} textAnchor="start" className="fill-current text-ink/40" fontSize="10">
            {formatPSTShort(pts[0].t)}
          </text>
          <text x={W - PAD_R} y={H - 7} textAnchor="end" className="fill-current text-ink/40" fontSize="10">
            {formatPSTShort(pts[n - 1].t)}
          </text>

          {/* hover crosshair + dot */}
          {hv && (
            <g>
              <line
                x1={xAt(hover!)}
                x2={xAt(hover!)}
                y1={PAD_T}
                y2={PAD_T + PLOT_H}
                stroke="currentColor"
                className="text-ink/30"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={xAt(hover!)} cy={yAt(hv.y)} r={4} fill={color} stroke="#fff" strokeWidth={1.5} />
            </g>
          )}
        </svg>
      </div>

      {hv && (
        <div
          className="pointer-events-none absolute top-5 z-10 -translate-x-1/2 rounded-lg border border-ink/10 bg-paper px-2 py-1 text-xs shadow-card"
          style={{ left: `${tipLeft}%` }}
        >
          <div className="tnum font-semibold">{hv.y.toFixed(0)}¢</div>
          <div className="text-ink/50">{formatPSTShort(hv.t)}</div>
        </div>
      )}
    </div>
  );
}
