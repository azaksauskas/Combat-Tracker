import { Circle, Group, Line, Rect, Text } from "react-konva";
import { INK, PAPER } from "./inkBoard";
import type { MapObject } from "./state";

/**
 * Doors, gates, levers, traps, chests, loot and the ways in and out, drawn
 * in the same pen and ink as the map, one square each.
 */

const WOOD = "#b48a5a";
const WOOD_DARK = "#7a5634";
const IRON = "#55524c";
const GOLD = "#d9a82e";
const RED = "#a8322a";
const WATER = "#a9c7d6";

export function MapObjectShape({ o, cell, exitColor }: { o: MapObject; cell: number; exitColor: string }) {
  const x = o.pos.x * cell;
  const y = o.pos.y * cell;
  const s = cell;
  const sw = Math.max(1.2, s * 0.035);
  const across = o.dir !== "v"; // runs left–right
  const at = (inner: React.ReactNode) => (
    <Group x={x} y={y} listening={false}>
      {inner}
    </Group>
  );

  switch (o.kind) {
    case "door": {
      const t = s * 0.26;
      if (!o.open) {
        // A plank door filling the gap in the wall.
        const w = across ? s : t;
        const h = across ? t : s;
        const ox = across ? 0 : (s - t) / 2;
        const oy = across ? (s - t) / 2 : 0;
        return at(
          <>
            <Rect x={ox} y={oy} width={w} height={h} fill={WOOD} stroke={INK} strokeWidth={sw} />
            {[0.25, 0.5, 0.75].map((f) => (
              <Line key={f} points={across ? [s * f, oy, s * f, oy + h] : [ox, s * f, ox + w, s * f]} stroke={WOOD_DARK} strokeWidth={sw * 0.7} />
            ))}
            {o.locked && (
              <>
                <Circle x={s / 2} y={s / 2} radius={s * 0.11} fill={GOLD} stroke={INK} strokeWidth={sw} />
                <Rect x={s / 2 - s * 0.02} y={s / 2 - s * 0.03} width={s * 0.04} height={s * 0.08} fill={INK} />
              </>
            )}
          </>,
        );
      }
      // Open: the leaf swung back against the side of the doorway.
      return at(
        <>
          <Rect x={across ? 0 : (s - t) / 2} y={across ? (s - t) / 2 : 0} width={across ? s : t} height={across ? t : s} stroke={INK} strokeWidth={sw * 0.5} dash={[3, 3]} />
          <Rect x={across ? 0 : (s - t) / 2} y={across ? 0 : 0} width={across ? t * 0.6 : s} height={across ? s : t * 0.6} fill={WOOD} stroke={INK} strokeWidth={sw} />
        </>,
      );
    }
    case "gate": {
      const bars = 5;
      const pts = Array.from({ length: bars }, (_, i) => (i + 0.5) / bars);
      if (o.open)
        return at(
          <>
            <Rect x={across ? 0 : s * 0.4} y={across ? s * 0.4 : 0} width={across ? s : s * 0.2} height={across ? s * 0.2 : s} stroke={IRON} strokeWidth={sw * 0.6} dash={[2, 3]} />
          </>,
        );
      return at(
        <>
          <Line points={across ? [0, s * 0.3, s, s * 0.3] : [s * 0.3, 0, s * 0.3, s]} stroke={IRON} strokeWidth={sw * 1.3} />
          <Line points={across ? [0, s * 0.7, s, s * 0.7] : [s * 0.7, 0, s * 0.7, s]} stroke={IRON} strokeWidth={sw * 1.3} />
          {pts.map((f) => (
            <Line key={f} points={across ? [s * f, s * 0.12, s * f, s * 0.88] : [s * 0.12, s * f, s * 0.88, s * f]} stroke={INK} strokeWidth={sw * 1.6} lineCap="round" />
          ))}
        </>,
      );
    }
    case "lever": {
      const tip = o.open ? { x: s * 0.72, y: s * 0.3 } : { x: s * 0.28, y: s * 0.3 };
      return at(
        <>
          <Rect x={s * 0.3} y={s * 0.6} width={s * 0.4} height={s * 0.18} fill={IRON} stroke={INK} strokeWidth={sw} cornerRadius={2} />
          <Line points={[s / 2, s * 0.64, tip.x, tip.y]} stroke={INK} strokeWidth={sw * 2} lineCap="round" />
          <Circle x={tip.x} y={tip.y} radius={s * 0.08} fill={RED} stroke={INK} strokeWidth={sw} />
        </>,
      );
    }
    case "trap": {
      if (o.hidden) return null;
      const live = !!o.armed;
      const col = live ? RED : "#8a857c";
      const m = s * 0.14;
      return at(
        <>
          <Rect x={m} y={m} width={s - 2 * m} height={s - 2 * m} stroke={col} strokeWidth={sw * 1.2} dash={[4, 3]} fill={live ? "rgba(168,50,42,0.12)" : undefined} />
          {o.trap === "spikes" || !o.trap ? (
            [0.32, 0.5, 0.68].map((f) => <Line key={f} points={[s * (f - 0.07), s * 0.64, s * f, s * 0.36, s * (f + 0.07), s * 0.64]} stroke={col} strokeWidth={sw} closed fill={live ? col : undefined} />)
          ) : (
            <Text x={0} y={0} width={s} height={s} text={o.trap === "fire" ? "🔥" : o.trap === "net" ? "#" : "➶"} align="center" verticalAlign="middle" fontSize={s * 0.4} fill={col} opacity={live ? 1 : 0.5} />
          )}
        </>,
      );
    }
    case "chest": {
      const w = s * 0.66;
      const h = s * 0.42;
      const ox = (s - w) / 2;
      const oy = s * 0.36;
      return at(
        <>
          <Rect x={ox} y={oy} width={w} height={h} fill={o.open ? WOOD_DARK : WOOD} stroke={INK} strokeWidth={sw} cornerRadius={2} />
          {o.open ? (
            <Rect x={ox} y={oy - h * 0.55} width={w} height={h * 0.5} fill={WOOD} stroke={INK} strokeWidth={sw} cornerRadius={2} />
          ) : (
            <>
              <Line points={[ox, oy + h * 0.35, ox + w, oy + h * 0.35]} stroke={INK} strokeWidth={sw} />
              <Rect x={s / 2 - s * 0.05} y={oy + h * 0.25} width={s * 0.1} height={s * 0.12} fill={o.locked ? GOLD : IRON} stroke={INK} strokeWidth={sw * 0.7} />
            </>
          )}
        </>,
      );
    }
    case "loot": {
      if (o.open) return null;
      if (o.group && !o.loot) return at(<Text x={0} y={0} width={s} height={s} text="🗝" align="center" verticalAlign="middle" fontSize={s * 0.5} />);
      if (o.loot?.stash?.javelin)
        return at(
          <>
            {[0.35, 0.5, 0.65].map((f) => (
              <Line key={f} points={[s * (f - 0.12), s * 0.82, s * (f + 0.12), s * 0.18]} stroke={WOOD_DARK} strokeWidth={sw * 1.4} lineCap="round" />
            ))}
            {[0.35, 0.5, 0.65].map((f) => (
              <Line key={`t${f}`} points={[s * (f + 0.12), s * 0.18, s * (f + 0.07), s * 0.28, s * (f + 0.15), s * 0.26]} stroke={INK} strokeWidth={sw} closed fill={IRON} />
            ))}
          </>,
        );
      return at(
        <>
          {[
            [0.42, 0.56],
            [0.56, 0.6],
            [0.5, 0.46],
          ].map(([cx, cy], i) => (
            <Circle key={i} x={s * cx!} y={s * cy!} radius={s * 0.1} fill={GOLD} stroke={INK} strokeWidth={sw * 0.8} />
          ))}
        </>,
      );
    }
    case "barrel":
      return at(
        <>
          <Circle x={s / 2} y={s / 2} radius={s * 0.34} fill={WOOD} stroke={INK} strokeWidth={sw} />
          <Circle x={s / 2} y={s / 2} radius={s * 0.24} stroke={IRON} strokeWidth={sw} />
          <Circle x={s / 2} y={s / 2} radius={s * 0.05} fill={INK} />
        </>,
      );
    case "entrance":
    case "exit": {
      const exit = o.kind === "exit";
      const frame = exit ? <Rect x={1} y={1} width={s - 2} height={s - 2} stroke={exitColor} strokeWidth={sw * 1.6} dash={[6, 4]} cornerRadius={3} fill="rgba(80,160,90,0.12)" /> : null;
      let art: React.ReactNode;
      if (o.look === "ladder") {
        art = (
          <>
            <Line points={[s * 0.32, s * 0.1, s * 0.32, s * 0.9]} stroke={WOOD_DARK} strokeWidth={sw * 1.5} />
            <Line points={[s * 0.68, s * 0.1, s * 0.68, s * 0.9]} stroke={WOOD_DARK} strokeWidth={sw * 1.5} />
            {[0.2, 0.4, 0.6, 0.8].map((f) => (
              <Line key={f} points={[s * 0.32, s * f, s * 0.68, s * f]} stroke={WOOD_DARK} strokeWidth={sw * 1.2} />
            ))}
          </>
        );
      } else if (o.look === "boat") {
        art = (
          <>
            <Rect x={0} y={0} width={s} height={s} fill={WATER} opacity={0.5} />
            <Line points={[s * 0.1, s * 0.45, s * 0.9, s * 0.45, s * 0.75, s * 0.75, s * 0.25, s * 0.75]} closed fill={WOOD} stroke={INK} strokeWidth={sw} />
            <Line points={[s * 0.5, s * 0.45, s * 0.5, s * 0.08]} stroke={INK} strokeWidth={sw} />
            <Line points={[s * 0.5, s * 0.1, s * 0.78, s * 0.38, s * 0.5, s * 0.38]} closed fill={PAPER} stroke={INK} strokeWidth={sw * 0.8} />
          </>
        );
      } else if (o.look === "door") {
        art = (
          <>
            <Line points={[s * 0.25, s * 0.9, s * 0.25, s * 0.35, s * 0.5, s * 0.12, s * 0.75, s * 0.35, s * 0.75, s * 0.9]} closed fill={WOOD} stroke={INK} strokeWidth={sw} tension={0.2} />
            <Line points={[s * 0.5, s * 0.15, s * 0.5, s * 0.9]} stroke={WOOD_DARK} strokeWidth={sw * 0.8} />
            <Circle x={s * 0.62} y={s * 0.58} radius={s * 0.035} fill={INK} />
          </>
        );
      } else {
        // Stairs: treads getting narrower the further they go.
        const down = o.look === "stairs-down";
        art = (
          <>
            {[0, 1, 2, 3, 4].map((i) => {
              const f = down ? 1 - i * 0.12 : 0.52 + i * 0.12;
              const yy = s * (0.16 + i * 0.17);
              return <Rect key={i} x={(s - s * f * 0.8) / 2} y={yy} width={s * f * 0.8} height={s * 0.13} fill={i % 2 ? PAPER : "#e3dccb"} stroke={INK} strokeWidth={sw * 0.8} />;
            })}
          </>
        );
      }
      return at(
        <>
          {art}
          {frame}
          {exit && <Text x={0} y={s * 0.02} width={s - 3} text="EXIT" align="right" fontSize={Math.max(8, s * 0.15)} fontStyle="bold" fill={exitColor} />}
        </>,
      );
    }
  }
}
