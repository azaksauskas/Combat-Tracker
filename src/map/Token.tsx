import type Konva from "konva";
import { useEffect, useState } from "react";
import { Circle, Group, Image as KImage, Text } from "react-konva";
import { initials } from "../domain/combat";
import { CELL } from "../domain/grid";
import type { Combatant } from "../domain/types";

function useImage(src: string | null) {
  const [img, setImg] = useState<HTMLImageElement>();
  useEffect(() => {
    if (!src) return setImg(undefined);
    const el = new window.Image();
    el.onload = () => setImg(el);
    el.src = src;
    return () => {
      el.onload = null;
    };
  }, [src]);
  return img;
}

interface Props {
  combatant: Combatant;
  ring: string;
  active: boolean;
  draggable: boolean;
  onDragStart: (c: Combatant) => void;
  onDragMove: (c: Combatant, pos: { x: number; y: number }) => void;
  onDragEnd: (c: Combatant, node: Konva.Group) => void;
  onInspect: (c: Combatant) => void;
}

export function Token({ combatant: c, ring, active, draggable, onDragStart, onDragMove, onDragEnd, onInspect }: Props) {
  const img = useImage(c.image);
  const r = (CELL * c.size) / 2 - 2;
  const down = c.hpCurrent <= 0;

  return (
    <Group
      x={c.x}
      y={c.y}
      draggable={draggable}
      opacity={down ? 0.55 : 1}
      onDragStart={() => onDragStart(c)}
      onDragMove={(e) => onDragMove(c, e.currentTarget.position())}
      onDragEnd={(e) => onDragEnd(c, e.currentTarget as Konva.Group)}
      onDblClick={() => onInspect(c)}
      onDblTap={() => onInspect(c)}
      onMouseEnter={(e) => {
        const stage = e.target.getStage();
        if (stage && draggable) stage.container().style.cursor = "grab";
      }}
      onMouseLeave={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = "";
      }}
    >
      {active && <Circle radius={r + 6} stroke="#ef4444" strokeWidth={3} shadowColor="#ef4444" shadowBlur={16} />}
      <Circle radius={r} fill={c.isMonster ? "#7f1d1d" : "#1e3a8a"} shadowColor="black" shadowBlur={6} shadowOpacity={0.5} />
      {img && (
        <Group clipFunc={(ctx) => ctx.arc(0, 0, r, 0, Math.PI * 2)}>
          <KImage image={img} x={-r} y={-r} width={r * 2} height={r * 2} />
        </Group>
      )}
      {!img && (
        <Text
          text={initials(c.name)}
          width={r * 2}
          height={r * 2}
          x={-r}
          y={-r}
          align="center"
          verticalAlign="middle"
          fontStyle="bold"
          fontSize={Math.max(12, r * 0.8)}
          fill="white"
          listening={false}
        />
      )}
      <Circle radius={r} stroke={ring} strokeWidth={3} listening={false} />
      {down && <Text text="✕" fontSize={r * 1.6} x={-r} y={-r} width={r * 2} height={r * 2} align="center" verticalAlign="middle" fill="#ef4444" listening={false} />}
    </Group>
  );
}
