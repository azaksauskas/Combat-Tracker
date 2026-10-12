import type Konva from "konva";
import { useEffect, useState } from "react";
import { Circle, Group, Image as KImage, Text } from "react-konva";
import { initials } from "../domain/combat";
import { CELL } from "../domain/grid";
import type { Combatant } from "../domain/types";
import type { ThemeColors } from "../theme/themes";

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
  colors: ThemeColors;
  active: boolean;
  /** Shown in the details panel. */
  selected: boolean;
  /** Hovered here or in the initiative list. */
  hovered: boolean;
  draggable: boolean;
  onSelect: (c: Combatant) => void;
  onHover: (c: Combatant, on: boolean) => void;
  onDragStart: (c: Combatant) => void;
  onDragMove: (c: Combatant, pos: { x: number; y: number }) => void;
  onDragEnd: (c: Combatant, node: Konva.Group) => void;
  onInspect: (c: Combatant) => void;
}

export function Token({ combatant: c, ring, colors, active, selected, hovered, draggable, onSelect, onHover, onDragStart, onDragMove, onDragEnd, onInspect }: Props) {
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
      onClick={() => onSelect(c)}
      onTap={() => onSelect(c)}
      onDblClick={() => onInspect(c)}
      onDblTap={() => onInspect(c)}
      onMouseEnter={(e) => {
        onHover(c, true);
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = draggable ? "grab" : "pointer";
      }}
      onMouseLeave={(e) => {
        onHover(c, false);
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = "";
      }}
    >
      {(selected || hovered) && (
        <Circle
          radius={r + (active ? 11 : 6)}
          stroke={colors.highlight}
          strokeWidth={selected ? 3 : 2}
          dash={selected ? undefined : [6, 4]}
          listening={false}
        />
      )}
      {active && <Circle radius={r + 6} stroke={colors.accent} strokeWidth={3} shadowColor={colors.accent} shadowBlur={16} />}
      <Circle radius={r} fill={c.isMonster ? colors["token-monster"] : colors["token-player"]} shadowColor="black" shadowBlur={6} shadowOpacity={0.5} />
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
      {down && <Text text="✕" fontSize={r * 1.6} x={-r} y={-r} width={r * 2} height={r * 2} align="center" verticalAlign="middle" fill={colors.danger} listening={false} />}
    </Group>
  );
}
