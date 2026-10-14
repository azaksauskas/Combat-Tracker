import "@xyflow/react/dist/style.css";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, type Connection, type Edge, type Node, type NodeProps, type NodeChange, applyNodeChanges } from "@xyflow/react";
import type { Adventure } from "../domain/adventure";
import type { Issue } from "../game/adventure-edit";
import { END_DEFEAT, END_VICTORY, graphEdges, layoutGraph, type EdgeKind, type Pos } from "../game/adventure-graph";

/**
 * The adventure as a map of scenes: drag scenes around, draw an arrow from
 * one scene to another to add a choice, click a scene to edit it below.
 */

type SceneData = { title: string; text: string; choices: number; loops: number; start: boolean; problem: boolean; selected: boolean };
type EndData = { victory: boolean };

function SceneNode({ data }: NodeProps<Node<SceneData>>) {
  return (
    <div
      className={clsx(
        "w-52 rounded-lg border-2 bg-surface px-3 py-2 text-left shadow",
        data.selected ? "border-accent" : data.problem ? "border-danger" : "border-line",
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-muted" />
      <div className="flex items-center gap-1 truncate text-sm font-semibold text-strong">
        {data.start && <span title="First scene">⭐</span>}
        {data.problem && <span className="text-danger" title="Has problems">⚠</span>}
        <span className="truncate">{data.title}</span>
      </div>
      <div className="line-clamp-2 text-[11px] text-muted">{data.text || <i>No text yet</i>}</div>
      <div className="mt-1 text-[10px] text-faint">
        {data.choices} choice{data.choices === 1 ? "" : "s"}
        {data.loops > 0 && <span title="Choices that stay in this scene (a check to retry, a question to ask)"> · ↺ {data.loops} stay here</span>}
      </div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-accent" title="Drag to another scene to add a choice" />
    </div>
  );
}

function EndNode({ data }: NodeProps<Node<EndData>>) {
  return (
    <div className={clsx("rounded-full border-2 px-4 py-2 font-display text-sm font-bold shadow", data.victory ? "border-heal bg-heal/15 text-heal" : "border-danger bg-danger/15 text-danger")}>
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-muted" />
      {data.victory ? "🏁 The end: victory" : "☠ The end: defeat"}
    </div>
  );
}

const nodeTypes = { scene: SceneNode, end: EndNode };

const EDGE_STYLE: Record<EdgeKind, { stroke: string; dash?: string }> = {
  go: { stroke: "var(--muted)" },
  failure: { stroke: "var(--warn)", dash: "6 4" },
  win: { stroke: "var(--heal)" },
  lose: { stroke: "var(--danger)", dash: "6 4" },
  end: { stroke: "var(--faint)" },
};

export function AdventureGraph({
  adventure: adv,
  issues,
  selected,
  onSelect,
  onMove,
  onConnect,
}: {
  adventure: Adventure;
  issues: Issue[];
  selected: string | null;
  onSelect: (sceneId: string) => void;
  onMove: (id: string, p: Pos) => void;
  onConnect: (from: string, to: string) => void;
}) {
  const positions = useMemo(() => layoutGraph(adv), [adv]);
  const all = useMemo(() => graphEdges(adv), [adv]);
  const built = useMemo((): Node[] => {
    const bad = new Set(issues.filter((i) => i.level === "error" && i.sceneId).map((i) => i.sceneId!));
    return [
      ...Object.values(adv.scenes).map(
        (s): Node<SceneData> => ({
          id: s.id,
          type: "scene",
          position: positions[s.id]!,
          data: {
            title: s.title || s.id,
            text: s.text,
            choices: s.choices.length,
            loops: new Set(all.filter((e) => e.source === s.id && e.target === s.id).map((e) => e.choiceId)).size,
            start: s.id === adv.start,
            problem: bad.has(s.id),
            selected: s.id === selected,
          },
        }),
      ),
      { id: END_VICTORY, type: "end", position: positions[END_VICTORY]!, data: { victory: true } },
      { id: END_DEFEAT, type: "end", position: positions[END_DEFEAT]!, data: { victory: false } },
    ];
  }, [adv, positions, issues, selected, all]);
  // React Flow moves nodes locally while dragging; the adventure is saved on drop.
  const [nodes, setNodes] = useState<Node[]>(built);
  useEffect(() => setNodes(built), [built]);

  // One arrow per pair of scenes (labels merged); choices that stay put are shown on the scene instead.
  const edges = useMemo((): Edge[] => {
    const groups = new Map<string, typeof all>();
    for (const e of all) {
      if (e.source === e.target) continue;
      const k = `${e.source}→${e.target}`;
      groups.set(k, [...(groups.get(k) ?? []), e]);
    }
    const rank: EdgeKind[] = ["lose", "win", "failure", "end", "go"];
    return [...groups.entries()].map(([k, es]) => {
      const kind = rank.find((r) => es.some((e) => e.kind === r)) ?? "go";
      const st = EDGE_STYLE[kind];
      return {
        id: k,
        source: es[0]!.source,
        target: es[0]!.target,
        // Labels only around the scene being edited, so the map stays readable.
        label: es[0]!.source === selected || es[0]!.target === selected ? (es.length > 2 ? `${es.length} choices` : es.map((e) => e.label).join(" / ")) : undefined,
        labelStyle: { fill: "var(--text)", fontSize: 11 },
        labelBgStyle: { fill: "var(--surface-2)" },
        style: { stroke: st.stroke, strokeWidth: es[0]!.source === selected ? 2.4 : 1.4, strokeDasharray: st.dash },
        markerEnd: { type: MarkerType.ArrowClosed, color: st.stroke },
        zIndex: es[0]!.source === selected ? 1 : 0,
      };
    });
  }, [all, selected]);

  return (
    <div className="h-[40rem] overflow-hidden rounded-lg border border-line bg-surface-2" aria-label="Scene graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={(changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns))}
        onNodeDragStop={(_, node) => onMove(node.id, node.position)}
        onNodeClick={(_, node) => node.type === "scene" && onSelect(node.id)}
        onEdgeClick={(_, edge) => onSelect(edge.source)}
        onConnect={(c: Connection) => c.source && c.target && c.source !== c.target && onConnect(c.source, c.target)}
        onConnectEnd={(event, state) => {
          // Dropped on a scene but not on its dot: connect anyway.
          if (state.isValid || !state.fromNode) return;
          const pt = "changedTouches" in event ? event.changedTouches[0]! : event;
          const el = document.elementFromPoint(pt.clientX, pt.clientY)?.closest(".react-flow__node");
          const to = el?.getAttribute("data-id");
          if (to && to !== state.fromNode.id) onConnect(state.fromNode.id, to);
        }}
        isValidConnection={(c) => c.source !== c.target && c.source !== END_VICTORY && c.source !== END_DEFEAT}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
      >
        <Background color="var(--line)" gap={24} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={(n) => (n.type === "end" ? "var(--faint)" : (n.data as SceneData).problem ? "var(--danger)" : "var(--accent)")} maskColor="rgba(0,0,0,0.12)" bgColor="var(--surface)" />
      </ReactFlow>
    </div>
  );
}
