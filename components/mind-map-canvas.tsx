"use client";

import type { MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Background,
  Controls,
  Handle,
  PanOnScrollMode,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Download, MessageSquare, Pin, Send, Sparkles, WandSparkles, X } from "lucide-react";
import { toPng } from "html-to-image";

import { getNodeCombinedContent, getNodeDisplayContent, rebalanceFlatMindMapNodes } from "@/lib/mindmap";
import { cn } from "@/lib/utils";
import type { MindMapDocument, MindMapNode } from "@/types";

const NODE_WIDTH = 290;
const NODE_HEIGHT = 170;
const NODE_MARGIN_X = 42;
const NODE_MARGIN_Y = 34;

function normalizeInsightText(text: string) {
  return text
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function FormattedText({ text }: { text: string }) {
  const lines = normalizeInsightText(text).split("\n");

  return (
    <>
      {lines.map((line, i) => {
        const trimmed = line.trim();

        if (!trimmed) return <div key={i} className="h-3" />;

        const isBullet = trimmed.startsWith("• ");
        const content = isBullet ? trimmed.slice(2) : trimmed;

        return (
          <p key={i} className={cn("text-sm leading-6 text-slate-600", i > 0 && "mt-2")}>
            {isBullet ? <span className="mr-2 font-semibold text-slate-400">•</span> : null}
            {content.split(/(\*\*.*?\*\*)/g).map((part, j) =>
              part.startsWith("**") && part.endsWith("**") ? (
                <strong key={j} className="font-semibold text-slate-800">
                  {part.slice(2, -2)}
                </strong>
              ) : (
                <span key={j}>{part}</span>
              )
            )}
          </p>
        );
      })}
    </>
  );
}

type FlowNodeData = {
  title: string;
  sourceContent: string;
  aiContent: string;
  color: string;
  aiGenerated: boolean;
  pinCount: number;
} & Record<string, unknown>;

function NodeSection({ label, content, muted }: { label: string; content: string; muted?: boolean }) {
  if (!content.trim()) return null;

  return (
    <div className={cn(muted && "opacity-95")}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">{content}</p>
    </div>
  );
}

function MapNodeCard({ data, selected }: NodeProps) {
  const nodeData = data as FlowNodeData;
  const pinCount = Number(nodeData.pinCount ?? 0);
  const hasAiSection = Boolean(nodeData.aiContent?.trim());

  return (
    <div
      className={cn(
        "min-w-52 max-w-72 rounded-3xl border border-white/80 bg-white/95 p-4 shadow-soft transition",
        selected && "ring-2 ring-slate-400"
      )}
      style={{ backgroundColor: String(nodeData.color) }}
    >
      <Handle type="target" position={Position.Left} id="left-target" className="!border-none !bg-slate-400" />
      <Handle type="source" position={Position.Left} id="left-source" className="!border-none !bg-slate-400" />
      <Handle type="target" position={Position.Right} id="right-target" className="!border-none !bg-slate-400" />
      <Handle type="source" position={Position.Right} id="right-source" className="!border-none !bg-slate-400" />
      <Handle type="target" position={Position.Top} id="top-target" className="!border-none !bg-transparent" />
      <Handle type="source" position={Position.Top} id="top-source" className="!border-none !bg-transparent" />
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="!border-none !bg-transparent" />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className="!border-none !bg-transparent" />

      <p className="text-sm font-semibold text-slate-800">{String(nodeData.title)}</p>
      <div className="mt-2 space-y-2">
        <NodeSection label="Uploaded file" content={String(nodeData.sourceContent || "")} />
        {hasAiSection ? <div className="border-t border-white/75 pt-2" /> : null}
        <NodeSection label="AI content" content={String(nodeData.aiContent || "")} muted />
      </div>

      <div className="mt-3 flex items-center gap-2">
        {Boolean(nodeData.aiGenerated) ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            <Sparkles className="h-3 w-3" />
            AI
          </span>
        ) : null}
        {pinCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-700">
            <Pin className="h-2.5 w-2.5" />
            {pinCount}
          </span>
        ) : null}
      </div>
    </div>
  );
}

const nodeTypes = {
  conceptNode: MapNodeCard
};

function getEdgeHandles(parent: MindMapNode, child: MindMapNode) {
  const dx = child.x - parent.x;
  const dy = child.y - parent.y;
  const angle = Math.atan2(dy, dx);

  if (angle >= -Math.PI / 4 && angle < Math.PI / 4) {
    return { sourceHandle: "right-source", targetHandle: "left-target" };
  }
  if (angle >= Math.PI / 4 && angle < (3 * Math.PI) / 4) {
    return { sourceHandle: "bottom-source", targetHandle: "top-target" };
  }
  if (angle >= (-3 * Math.PI) / 4 && angle < -Math.PI / 4) {
    return { sourceHandle: "top-source", targetHandle: "bottom-target" };
  }

  return { sourceHandle: "left-source", targetHandle: "right-target" };
}

interface MindMapCanvasProps {
  map: MindMapDocument;
  revisionPanel?: ReactNode;
}

type InsightModalState = { mode: "current"; text: string } | { mode: "pinned"; items: string[] } | null;
type LayoutNode = MindMapNode & { rootBranchId: string };
type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatSession = { messages: ChatMessage[]; draft: string };

function buildChildrenMap(nodes: MindMapNode[]) {
  const childrenMap = new Map<string, MindMapNode[]>();

  for (const node of nodes) {
    if (!node.parentId) continue;
    const children = childrenMap.get(node.parentId) ?? [];
    children.push(node);
    childrenMap.set(node.parentId, children);
  }

  return childrenMap;
}

function getRootBranchId(nodeId: string, nodeMap: Map<string, MindMapNode>) {
  let current = nodeMap.get(nodeId);
  if (!current) return nodeId;

  while (current.parentId) {
    const parent = nodeMap.get(current.parentId);
    if (!parent || parent.parentId === null) return current.id;
    current = parent;
  }

  return current.id;
}

function rectanglesOverlap(a: LayoutNode, b: LayoutNode) {
  return (
    Math.abs(a.x - b.x) < NODE_WIDTH + NODE_MARGIN_X &&
    Math.abs(a.y - b.y) < NODE_HEIGHT + NODE_MARGIN_Y
  );
}

function moveVisibleSubtree(
  layoutMap: Map<string, LayoutNode>,
  childrenMap: Map<string, MindMapNode[]>,
  hiddenNodeIds: Set<string>,
  nodeId: string,
  dx: number,
  dy: number
) {
  const node = layoutMap.get(nodeId);
  if (!node || hiddenNodeIds.has(nodeId)) return;

  node.x += dx;
  node.y += dy;

  const children = childrenMap.get(nodeId) ?? [];
  for (const child of children) {
    moveVisibleSubtree(layoutMap, childrenMap, hiddenNodeIds, child.id, dx, dy);
  }
}

function resolveVisibleOverlaps(
  nodes: Node[],
  baseNodes: MindMapNode[],
  hiddenNodeIds: Set<string>,
  focusNodeId?: string | null
) {
  const nodeMap = new Map<string, MindMapNode>(baseNodes.map((node) => [node.id, node]));
  const childrenMap = buildChildrenMap(baseNodes);
  const layoutMap = new Map<string, LayoutNode>();

  for (const baseNode of baseNodes) {
    const rendered = nodes.find((node) => node.id === baseNode.id);
    if (!rendered) continue;

    layoutMap.set(baseNode.id, {
      ...baseNode,
      x: rendered.position.x,
      y: rendered.position.y,
      rootBranchId: baseNode.parentId ? getRootBranchId(baseNode.id, nodeMap) : baseNode.id
    });
  }

  for (let iteration = 0; iteration < 12; iteration++) {
    let moved = false;
    const visible = Array.from(layoutMap.values()).filter((node) => !hiddenNodeIds.has(node.id));

    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        const first = visible[i];
        const second = visible[j];
        if (!rectanglesOverlap(first, second)) continue;

        const sameBranch = first.rootBranchId === second.rootBranchId;
        const dx = second.x - first.x || (i % 2 === 0 ? 1 : -1);
        const dy = second.y - first.y || (j % 2 === 0 ? 1 : -1);
        const distance = Math.hypot(dx, dy) || 1;
        const overlapX = NODE_WIDTH + NODE_MARGIN_X - Math.abs(dx);
        const overlapY = NODE_HEIGHT + NODE_MARGIN_Y - Math.abs(dy);
        const pushX = ((overlapX + (sameBranch ? 14 : 42)) * dx) / distance;
        const pushY = ((overlapY + (sameBranch ? 10 : 16)) * dy) / distance;

        let target = second.depth >= first.depth ? second : first;
        if (first.id === focusNodeId) target = second;
        if (second.id === focusNodeId) target = first;

        moveVisibleSubtree(
          layoutMap,
          childrenMap,
          hiddenNodeIds,
          target.id,
          target.id === second.id ? pushX : -pushX,
          target.id === second.id ? pushY : -pushY
        );
        moved = true;
      }
    }

    if (!moved) break;
  }

  return nodes.map((node) => {
    const next = layoutMap.get(node.id);
    return next ? { ...node, position: { x: next.x, y: next.y } } : node;
  });
}

export function MindMapCanvas({ map, revisionPanel }: MindMapCanvasProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);

  const [summaryMode, setSummaryMode] = useState(map.summaryMode);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(map.nodes[0]?.id ?? null);
  const [explanation, setExplanation] = useState("");
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<string[]>([]);
  const [isExplaining, startExplain] = useTransition();
  const [isChatting, startChatting] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const [pinnedExplanations, setPinnedExplanations] = useState<Record<string, string[]>>({});
  const [insightModal, setInsightModal] = useState<InsightModalState>(null);
  const [sidebarMode, setSidebarMode] = useState<"default" | "chat">("default");
  const [chatSessions, setChatSessions] = useState<Record<string, ChatSession>>({});

  const displayMapNodes = useMemo(() => rebalanceFlatMindMapNodes(map.nodes), [map.nodes]);
  const nodeMap = useMemo(() => new Map(displayMapNodes.map((node) => [node.id, node])), [displayMapNodes]);

  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) ?? null : null;
  const selectedPins = selectedNode ? pinnedExplanations[selectedNode.id] ?? [] : [];
  const activeChatSession = selectedNode
    ? chatSessions[selectedNode.id] ?? { messages: [], draft: "" }
    : { messages: [], draft: "" };

  const hiddenNodeIds = useMemo(() => {
    const hidden = new Set<string>();
    const childrenMap = buildChildrenMap(displayMapNodes);

    function hideChildren(parentId: string) {
      const children = childrenMap.get(parentId) ?? [];
      children.forEach((child) => {
        hidden.add(child.id);
        hideChildren(child.id);
      });
    }

    collapsedNodeIds.forEach((id) => hideChildren(id));
    return hidden;
  }, [collapsedNodeIds, displayMapNodes]);

  const initialNodes: Node[] = useMemo(
    () =>
      displayMapNodes.map((node) => {
        const content = getNodeDisplayContent(summaryMode ? { content: node.summary } : node);

        return {
          id: node.id,
          type: "conceptNode",
          position: { x: node.x, y: node.y },
          hidden: hiddenNodeIds.has(node.id),
          data: {
            title: node.title,
            sourceContent: content.sourceContent,
            aiContent: summaryMode ? "" : content.aiContent,
            color: node.color,
            aiGenerated: !summaryMode && node.aiGenerated,
            pinCount: (pinnedExplanations[node.id] ?? []).length
          }
        };
      }),
    [displayMapNodes, hiddenNodeIds, pinnedExplanations, summaryMode]
  );

  const initialEdges: Edge[] = useMemo(
    () =>
      displayMapNodes
        .filter((node) => node.parentId)
        .map((node) => {
          const parent = nodeMap.get(node.parentId!);
          const handles = parent
            ? getEdgeHandles(parent, node)
            : { sourceHandle: "right-source", targetHandle: "left-target" };

          return {
            id: `${node.parentId}-${node.id}`,
            source: node.parentId!,
            target: node.id,
            sourceHandle: handles.sourceHandle,
            targetHandle: handles.targetHandle,
            hidden: hiddenNodeIds.has(node.id),
            type: "smoothstep",
            animated: false,
            style: { stroke: "#94a3b8", strokeWidth: 2 }
          };
        }),
    [displayMapNodes, hiddenNodeIds, nodeMap]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(resolveVisibleOverlaps(initialNodes, displayMapNodes, hiddenNodeIds, selectedNodeId));
  }, [displayMapNodes, hiddenNodeIds, initialNodes, selectedNodeId, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  useEffect(() => {
    if (!selectedNodeId && displayMapNodes.length) {
      setSelectedNodeId(displayMapNodes[0].id);
    }
  }, [displayMapNodes, selectedNodeId]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;

    const handler = (event: WheelEvent) => {
      if (!event.ctrlKey) return;

      const instance = rfInstanceRef.current;
      if (!instance) return;

      event.preventDefault();

      const currentZoom = instance.getZoom();
      const delta = -event.deltaY * 0.0038;
      const nextZoom = Math.min(2, Math.max(0.05, currentZoom * Math.exp(delta)));
      void instance.zoomTo(nextZoom, { duration: 0 });
    };

    element.addEventListener("wheel", handler, { passive: false });
    return () => element.removeEventListener("wheel", handler);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: string }>).detail;
      const nodeId = detail?.nodeId;
      if (!nodeId) return;

      const target = nodeMap.get(nodeId);
      if (!target || !rfInstanceRef.current) return;

      setSelectedNodeId(nodeId);
      void rfInstanceRef.current.setCenter(target.x, target.y, { zoom: 0.82, duration: 450 });
    };

    window.addEventListener("mindmap:locate-node", handler);
    return () => window.removeEventListener("mindmap:locate-node", handler);
  }, [nodeMap]);

  const toggleSummary = useCallback(async () => {
    const next = !summaryMode;
    setSummaryMode(next);
    await fetch(`/api/maps/${map.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summaryMode: next })
    });
  }, [map.id, summaryMode]);

  const savePositions = useCallback(
    (nextNodes: Node[] = nodes) => {
      startSaving(async () => {
        await fetch(`/api/maps/${map.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodes: nextNodes.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y }))
          })
        });
      });
    },
    [map.id, nodes]
  );

  const scheduleAutoSave = useCallback(
    (nextNodes?: Node[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => savePositions(nextNodes), 900);
    },
    [savePositions]
  );

  function handleNodeClick(_: MouseEvent, node: Node) {
    setSelectedNodeId(node.id);
    setExplanation("");
  }

  function handleNodeDragStop() {
    const nextNodes = resolveVisibleOverlaps(nodes, displayMapNodes, hiddenNodeIds, selectedNodeId);
    setNodes(nextNodes);
    scheduleAutoSave(nextNodes);
  }

  function toggleBranch() {
    if (!selectedNode) return;
    const hasChildren = displayMapNodes.some((node) => node.parentId === selectedNode.id);
    if (!hasChildren) return;

    setCollapsedNodeIds((current) =>
      current.includes(selectedNode.id)
        ? current.filter((id) => id !== selectedNode.id)
        : [...current, selectedNode.id]
    );
  }

  useEffect(() => {
    setNodes((current) => resolveVisibleOverlaps(current, displayMapNodes, hiddenNodeIds, selectedNodeId));
  }, [collapsedNodeIds, displayMapNodes, hiddenNodeIds, selectedNodeId, setNodes]);

  function pinExplanation() {
    if (!selectedNode || !explanation) return;
    setPinnedExplanations((current) => ({
      ...current,
      [selectedNode.id]: [...(current[selectedNode.id] ?? []), explanation]
    }));
  }

  function askAiExplanation() {
    if (!selectedNode) return;

    startExplain(async () => {
      const response = await fetch(`/api/maps/${map.id}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: selectedNode.id })
      });

      const payload = await response.json();
      const nextExplanation = normalizeInsightText(payload.explanation || "No explanation available.");
      setExplanation(nextExplanation);
      setInsightModal({ mode: "current", text: nextExplanation });
    });
  }

  function submitChat() {
    if (!selectedNode) return;

    const question = activeChatSession.draft.trim();
    if (!question) return;

    const nextMessages = [...activeChatSession.messages, { role: "user" as const, content: question }];
    setSidebarMode("chat");
    setChatSessions((current) => ({
      ...current,
      [selectedNode.id]: {
        messages: nextMessages,
        draft: ""
      }
    }));

    startChatting(async () => {
      try {
        const response = await fetch(`/api/maps/${map.id}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            nodeId: selectedNode.id,
            messages: nextMessages.slice(-10)
          })
        });

        const payload = await response.json();
        const answer =
          response.ok && payload.answer
            ? payload.answer
            : payload.error || "I couldn't generate a response just now.";

        setChatSessions((current) => {
          const existing = current[selectedNode.id] ?? { messages: [], draft: "" };

          return {
            ...current,
            [selectedNode.id]: {
              ...existing,
              messages: [...existing.messages, { role: "assistant", content: answer }]
            }
          };
        });
      } catch {
        setChatSessions((current) => {
          const existing = current[selectedNode.id] ?? { messages: [], draft: "" };

          return {
            ...current,
            [selectedNode.id]: {
              ...existing,
              messages: [...existing.messages, { role: "assistant", content: "The chatbot ran into a network error. Please try again." }]
            }
          };
        });
      }
    });
  }

  async function exportImage() {
    const instance = rfInstanceRef.current;
    const flowWrapper = canvasRef.current?.querySelector(".react-flow") as HTMLElement | null;
    if (!instance || !flowWrapper) return;

    const visibleNodes = instance.getNodes().filter((node) => !node.hidden);
    if (visibleNodes.length === 0) return;

    const originalViewport = instance.getViewport();

    try {
      await instance.fitView({
        nodes: visibleNodes,
        padding: 0.18,
        includeHiddenNodes: false,
        duration: 0
      });

      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

      const dataUrl = await toPng(flowWrapper, {
        cacheBust: true,
        backgroundColor: "#f8fafc",
        pixelRatio: 3
      });

      const link = document.createElement("a");
      link.download = `${map.title}-mind-map.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      await instance.setViewport(originalViewport, { duration: 0 });
    }
  }

  const selectedContent = selectedNode ? getNodeDisplayContent(selectedNode) : { sourceContent: "", aiContent: "" };

  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute left-6 top-6 z-20 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={toggleSummary}
            className="rounded-full border border-white/60 bg-white/85 px-4 py-2 text-sm font-medium text-slate-700 shadow-soft"
          >
            Summary Mode: {summaryMode ? "On" : "Off"}
          </button>
          <button
            type="button"
            onClick={() => savePositions()}
            className="rounded-full border border-white/60 bg-white/85 px-4 py-2 text-sm font-medium text-slate-700 shadow-soft"
          >
            {isSaving ? "Saving..." : "Save layout"}
          </button>
          <button
            type="button"
            onClick={exportImage}
            className="inline-flex rounded-full border border-white/60 bg-white/85 px-4 py-2 text-sm font-medium text-slate-700 shadow-soft"
          >
            <Download className="mr-2 h-4 w-4" />
            Export image
          </button>
        </div>

        <div ref={canvasRef} className="animated-grid h-full w-full">
          <ReactFlow
            fitView
            fitViewOptions={{ padding: 0.36 }}
            minZoom={0.05}
            maxZoom={2}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onNodeDragStop={handleNodeDragStop}
            onInit={(instance) => {
              rfInstanceRef.current = instance;
            }}
            panOnScroll
            panOnScrollMode={PanOnScrollMode.Free}
            panOnScrollSpeed={3}
            zoomOnScroll={false}
            zoomOnPinch
            defaultEdgeOptions={{ type: "smoothstep", style: { stroke: "#94a3b8", strokeWidth: 2 } }}
            className="h-full w-full"
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} color="#dbe4ee" />
            <Controls showInteractive />
          </ReactFlow>
        </div>
      </div>

      <aside className="h-screen w-full max-w-md shrink-0 overflow-y-auto border-l border-white/60 bg-white/70 p-6 backdrop-blur-xl">
        {selectedNode ? (
          <>
            <div className="rounded-3xl p-5" style={{ backgroundColor: selectedNode.color }}>
              <div className="flex items-center gap-2">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Selected node</p>
                {selectedNode.aiGenerated ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <Sparkles className="h-3 w-3" />
                    AI
                  </span>
                ) : null}
              </div>
              <h2 className="mt-3 text-2xl font-semibold text-slate-800">{selectedNode.title}</h2>
              <div className="mt-4 space-y-3">
                <NodeSection label="Uploaded file" content={selectedContent.sourceContent} />
                {selectedContent.aiContent.trim() ? <div className="border-t border-white/75 pt-3" /> : null}
                <NodeSection label="AI content" content={selectedContent.aiContent} muted />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={askAiExplanation}
                className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                <WandSparkles className="mr-2 h-4 w-4" />
                {isExplaining ? "Expanding..." : "AI Expand"}
              </button>
              <button
                type="button"
                onClick={toggleBranch}
                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
              >
                {collapsedNodeIds.includes(selectedNode.id) ? "Expand branch" : "Collapse branch"}
              </button>
              <button
                type="button"
                onClick={() => setSidebarMode("chat")}
                className={cn(
                  "inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition",
                  sidebarMode === "chat"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                )}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Chatbot
              </button>
              {selectedPins.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setInsightModal({ mode: "pinned", items: selectedPins })}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
                >
                  <Pin className="h-3.5 w-3.5" />
                  View {selectedPins.length} insight{selectedPins.length > 1 ? "s" : ""}
                </button>
              ) : null}
            </div>

            {sidebarMode === "chat" ? (
              <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Chatbot</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Ask anything about the selected topic, the uploaded file, or the wider map.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSidebarMode("default")}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                  >
                    Back to details
                  </button>
                </div>

                <div className="mt-4 h-[360px] space-y-3 overflow-y-auto rounded-2xl bg-slate-50 p-4">
                  {activeChatSession.messages.length === 0 ? (
                    <div className="rounded-2xl bg-white p-4 text-sm text-slate-600">
                      Try asking: "Explain this topic with an example", "How does this connect to the rest of the map?", or "Give me a simple real-world analogy."
                    </div>
                  ) : (
                    activeChatSession.messages.map((message, index) => (
                      <div
                        key={`${message.role}-${index}`}
                        className={cn(
                          "rounded-2xl p-4 text-sm leading-6",
                          message.role === "user" ? "ml-8 bg-slate-900 text-white" : "mr-8 bg-white text-slate-700"
                        )}
                      >
                        {message.role === "assistant" ? (
                          <FormattedText text={message.content} />
                        ) : (
                          <p className="whitespace-pre-wrap text-sm leading-6 text-white">{message.content}</p>
                        )}
                      </div>
                    ))
                  )}
                  {isChatting ? (
                    <div className="mr-8 rounded-2xl bg-white p-4 text-sm text-slate-500">Thinking...</div>
                  ) : null}
                </div>

                <div className="mt-4 flex items-end gap-3">
                  <textarea
                    className="min-h-[88px] flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    placeholder="Ask the chatbot anything about this map..."
                    value={activeChatSession.draft}
                    onChange={(event) => {
                      if (!selectedNode) return;
                      const draft = event.target.value;

                      setChatSessions((current) => ({
                        ...current,
                        [selectedNode.id]: {
                          messages: current[selectedNode.id]?.messages ?? [],
                          draft
                        }
                      }));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        submitChat();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={submitChat}
                    disabled={!activeChatSession.draft.trim() || isChatting}
                    className="inline-flex items-center rounded-full bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AI insight</p>
                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    AI explanations open in a focused popup and stay separate from your uploaded-file notes.
                  </p>
                  {explanation ? (
                    <button
                      type="button"
                      onClick={() => setInsightModal({ mode: "current", text: explanation })}
                      className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
                    >
                      <Sparkles className="h-4 w-4" />
                      Open latest insight
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Map metadata</p>
                  <p className="mt-3 text-sm text-slate-600">Source: {map.sourceName || "Unknown"}</p>
                  <p className="mt-1 text-sm text-slate-600">Type: {map.sourceType || "Unknown"}</p>
                  <p className="mt-1 text-sm text-slate-600">Nodes: {map.nodes.length}</p>
                </div>

                {revisionPanel ? <div className="mt-4">{revisionPanel}</div> : null}
              </>
            )}
          </>
        ) : null}
      </aside>

      {insightModal && selectedNode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative mx-4 max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setInsightModal(null)}
              className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2">
              {insightModal.mode === "pinned" ? <Pin className="h-4 w-4 text-amber-500" /> : <Sparkles className="h-4 w-4 text-sky-500" />}
              <h3 className="text-lg font-semibold text-slate-800">
                {insightModal.mode === "pinned" ? "Saved AI Insights" : "AI Insight"} - {selectedNode.title}
              </h3>
            </div>

            {insightModal.mode === "current" ? (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <FormattedText text={insightModal.text} />
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={pinExplanation}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
                  >
                    <Pin className="h-3.5 w-3.5" />
                    Pin insight
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {insightModal.items.map((text, idx) => (
                  <div key={`${selectedNode.id}-${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-600">Insight {idx + 1}</p>
                    <FormattedText text={text} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
