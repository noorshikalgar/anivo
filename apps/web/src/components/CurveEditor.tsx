/**
 * Curve editor (docs/19 R3): the easing of a key or block as a cubic bezier.
 * Drag the two handles: time goes to the right, the value goes up. Presets
 * set common curves in one click.
 */
import { easingFn } from "@anivo/engine";
import type { Easing } from "@anivo/schema";
import { makeStyles } from "@fluentui/react-components";
import { useRef } from "react";

const W = 180;
const H = 180;
const PAD = 24;
/** The value range of the box: a little more than 0 to 1, so a handle can overshoot. */
const Y_MIN = -0.35;
const Y_MAX = 1.35;

const PRESETS: { name: string; easing: Easing }[] = [
  { name: "Linear", easing: "linear" },
  { name: "Easy ease", easing: "ease-in-out" },
  { name: "Slow start", easing: "ease-in" },
  { name: "Slow end", easing: "ease-out" },
  { name: "Overshoot", easing: { cubicBezier: [0.34, 1.56, 0.64, 1] } },
  { name: "Snap", easing: { cubicBezier: [0.9, 0, 0.1, 1] } },
  { name: "Hold", easing: "hold" },
];

/** The bezier handles of a named easing, for the editor. Springs and hold have none. */
export function handlesOf(e: Easing): [number, number, number, number] | null {
  if (typeof e === "object" && "cubicBezier" in e) return e.cubicBezier;
  const named: Record<string, [number, number, number, number]> = { linear: [0, 0, 1, 1], "ease-in": [0.42, 0, 1, 1], "ease-out": [0, 0, 0.58, 1], "ease-in-out": [0.42, 0, 0.58, 1] };
  return typeof e === "string" ? (named[e] ?? null) : null;
}

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "6px", width: `${W}px` },
  presets: { display: "flex", flexWrap: "wrap", gap: "3px" },
  preset: { border: "none", borderRadius: "3px", padding: "1px 6px", fontSize: "11px", cursor: "pointer", color: "var(--ui-text)", backgroundColor: "var(--ui-widget)", ":hover": { backgroundColor: "var(--ui-widget-hover)" } },
  svg: { touchAction: "none", backgroundColor: "var(--ui-field)", borderRadius: "4px" },
  note: { fontSize: "11px", color: "var(--ui-muted)" },
});

export function CurveEditor({ value, onChange }: { value: Easing; onChange: (e: Easing, done: boolean) => void }) {
  const s = useStyles();
  const svgRef = useRef<SVGSVGElement>(null);
  const handles = handlesOf(value);
  const sx = (t: number) => PAD + t * (W - 2 * PAD);
  const sy = (v: number) => PAD + ((Y_MAX - v) / (Y_MAX - Y_MIN)) * (H - 2 * PAD) * ((Y_MAX - Y_MIN) / (Y_MAX - Y_MIN));
  const vy = (y: number) => Y_MAX - ((y - PAD) / (H - 2 * PAD)) * (Y_MAX - Y_MIN);
  const fn = easingFn(value);
  const pts = Array.from({ length: 41 }, (_, i) => `${sx(i / 40).toFixed(1)},${sy(fn(i / 40)).toFixed(1)}`).join(" ");

  const drag = (e: React.PointerEvent, which: 0 | 1) => {
    if (!handles) return;
    e.preventDefault();
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    let cur = handles;
    const at = (ev: PointerEvent): [number, number, number, number] => {
      const r = svgRef.current!.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (ev.clientX - r.left - PAD) / (W - 2 * PAD)));
      const v = Math.min(Y_MAX, Math.max(Y_MIN, vy(ev.clientY - r.top)));
      const round = (n: number) => Math.round(n * 100) / 100;
      return which === 0 ? [round(t), round(v), cur[2], cur[3]] : [cur[0], cur[1], round(t), round(v)];
    };
    const move = (ev: PointerEvent) => {
      cur = at(ev);
      onChange({ cubicBezier: cur }, false);
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move as EventListener);
      el.removeEventListener("pointerup", up as EventListener);
      onChange({ cubicBezier: at(ev) }, true);
    };
    el.addEventListener("pointermove", move as EventListener);
    el.addEventListener("pointerup", up as EventListener);
  };

  return (
    <div className={s.root}>
      <svg ref={svgRef} className={s.svg} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Easing curve editor">
        <rect x={sx(0)} y={sy(1)} width={sx(1) - sx(0)} height={sy(0) - sy(1)} fill="none" stroke="var(--ui-outline)" />
        <polyline points={pts} fill="none" stroke="#f5b84a" strokeWidth="2" />
        {handles && (
          <>
            <line x1={sx(0)} y1={sy(0)} x2={sx(handles[0])} y2={sy(handles[1])} stroke="var(--ui-muted)" />
            <line x1={sx(1)} y1={sy(1)} x2={sx(handles[2])} y2={sy(handles[3])} stroke="var(--ui-muted)" />
            {([0, 1] as const).map((w) => (
              <circle
                key={w}
                cx={sx(handles[w * 2]!)}
                cy={sy(handles[w * 2 + 1]!)}
                r="6"
                fill="var(--ui-select)"
                stroke="#fff"
                style={{ cursor: "grab" }}
                role="slider"
                aria-label={w === 0 ? "Start handle" : "End handle"}
                aria-valuenow={handles[w * 2]}
                onPointerDown={(e) => drag(e, w)}
              />
            ))}
          </>
        )}
      </svg>
      {!handles && <div className={s.note}>This easing has no handles. Choose a preset to edit the curve.</div>}
      <div className={s.presets}>
        {PRESETS.map((p) => (
          <button key={p.name} type="button" className={s.preset} onClick={() => onChange(p.easing, true)}>
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}
