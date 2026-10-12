import type Konva from "konva";
import { Group, Rect, Circle, RegularPolygon } from "react-konva";
import { CELL } from "../domain/grid";
import type { MapShape } from "../domain/types";

interface Props {
  shape: MapShape;
  editable: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<MapShape>) => void;
}

/** Area templates (cube, sphere, cone…) as translucent shapes. */
export function MapShapeNode({ shape: s, editable, onSelect, onChange }: Props) {
  const px = s.size * CELL;
  const common = { fill: s.color, opacity: 0.35, stroke: s.color, strokeWidth: 2, strokeScaleEnabled: false };

  return (
    <Group
      id={`shape-${s.id}`}
      x={s.x}
      y={s.y}
      rotation={s.rotation}
      draggable={editable}
      listening={editable}
      onPointerDown={onSelect}
      onDragEnd={(e) => onChange({ x: e.currentTarget.x(), y: e.currentTarget.y() })}
      onTransformEnd={(e) => {
        const node = e.currentTarget as Konva.Group;
        const scale = node.scaleX();
        node.scale({ x: 1, y: 1 });
        onChange({ x: node.x(), y: node.y(), rotation: node.rotation(), size: Math.max(0.5, s.size * scale) });
      }}
    >
      {s.type === "square" && <Rect x={-px / 2} y={-px / 2} width={px} height={px} {...common} />}
      {s.type === "circle" && <Circle radius={px / 2} {...common} />}
      {s.type === "triangle" && <RegularPolygon sides={3} radius={px / 2} {...common} />}
    </Group>
  );
}
