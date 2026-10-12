import { newId } from "./combat";
import { parseDoc, type Docs } from "./types";

/**
 * Converts the single Firestore document written by the original one-file
 * HTML app into the new split documents. Field renames:
 *   resistances -> notes, sharedCombatants/savedCombatants -> roster,
 *   dmNotes -> campaign, line points [{x,y}] -> flat [x,y,...].
 */
export function migrateLegacyState(raw: unknown): Docs {
  const data = (raw ?? {}) as Record<string, unknown>;
  const asArray = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v : []);

  const combatant = (c: Record<string, unknown>) => ({
    ...c,
    notes: c.notes ?? c.resistances ?? "",
    hpCurrent: c.hpCurrent ?? c.hpMax ?? 0,
  });

  const mapState = (data.mapState ?? {}) as Record<string, unknown>;
  const ui = (data.ui ?? {}) as Record<string, unknown>;

  return {
    combat: parseDoc("combat", {
      combatants: asArray(data.combatants).map(combatant),
      activeId: data.activeId != null ? String(data.activeId) : null,
      round: data.activeId != null ? 1 : 0,
      map: {
        grid: ui.mapGrid,
        lines: asArray(mapState.lines).map((l) => ({
          id: newId(),
          color: l.color,
          points: asArray(l.points).flatMap((p) => [Number(p.x), Number(p.y)]),
        })),
        shapes: asArray(mapState.shapes).map((s) => ({ ...s, id: newId() })),
      },
    }),
    library: parseDoc("library", {
      roster: asArray(data.sharedCombatants ?? data.savedCombatants).map(combatant),
      encounters: asArray(data.encounters).map((e) => ({
        id: newId(),
        name: e.name,
        combatants: asArray(e.combatants).map(combatant),
      })),
    }),
    notes: parseDoc("notes", { campaign: data.dmNotes ?? "" }),
  };
}
