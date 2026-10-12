import { Layer, Rect, Shape } from "react-konva";
import { CELL, HEX_R, HEX_ROW, HEX_W, MAP_SIZE, hexCenter, hexCorners } from "../domain/grid";
import type { GridType } from "../domain/types";

export interface ViewBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Background and grid. Only the cells inside the viewport are drawn, so the
 * map can grow far beyond the original 3000px without slowing panning down.
 */
export function GridLayer({ grid, bounds, bg, line }: { grid: GridType; bounds: ViewBounds; bg: string; line: string }) {
  return (
    <Layer listening={false}>
      <Rect x={0} y={0} width={MAP_SIZE} height={MAP_SIZE} fill={bg} />
      <Shape
        perfectDrawEnabled={false}
        sceneFunc={(ctx, shape) => {
          const x0 = Math.max(0, bounds.x0);
          const y0 = Math.max(0, bounds.y0);
          const x1 = Math.min(MAP_SIZE, bounds.x1);
          const y1 = Math.min(MAP_SIZE, bounds.y1);
          ctx.beginPath();
          if (grid === "square") {
            for (let x = Math.floor(x0 / CELL) * CELL; x <= x1; x += CELL) {
              ctx.moveTo(x, y0);
              ctx.lineTo(x, y1);
            }
            for (let y = Math.floor(y0 / CELL) * CELL; y <= y1; y += CELL) {
              ctx.moveTo(x0, y);
              ctx.lineTo(x1, y);
            }
          } else {
            const r0 = Math.max(0, Math.floor((y0 - HEX_R) / HEX_ROW) - 1);
            const r1 = Math.ceil((y1 - HEX_R) / HEX_ROW) + 1;
            const c0 = Math.max(0, Math.floor(x0 / HEX_W) - 1);
            const c1 = Math.ceil(x1 / HEX_W) + 1;
            for (let row = r0; row <= r1; row++) {
              for (let col = c0; col <= c1; col++) {
                const pts = hexCorners(hexCenter(col, row));
                ctx.moveTo(pts[0]!.x, pts[0]!.y);
                for (let i = 1; i <= 6; i++) ctx.lineTo(pts[i % 6]!.x, pts[i % 6]!.y);
              }
            }
          }
          ctx.strokeShape(shape);
        }}
        stroke={line}
        strokeWidth={1}
      />
    </Layer>
  );
}
