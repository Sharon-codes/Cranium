import { BRANCH_COLORS } from "@/lib/constants";
import type { MindMapNode, TopicTree, TopicTreeNode } from "@/types";

const RADIUS_BASE = 540;
const RADIUS_DECAY = 0.88;
const RADIUS_MIN = 250;
const X_STRETCH = 1.5;
const Y_STRETCH = 0.82;
const ROOT_START_ANGLE = -Math.PI / 2;
const MIN_CHILD_SPAN = Math.PI / 8;
const NODE_WIDTH = 290;
const NODE_HEIGHT = 170;
const NODE_MARGIN_X = 44;
const NODE_MARGIN_Y = 32;
const CONTENT_SOURCE_START = "[[SOURCE]]";
const CONTENT_SOURCE_END = "[[/SOURCE]]";
const CONTENT_AI_START = "[[AI]]";
const CONTENT_AI_END = "[[/AI]]";

export function normalizeBulletText(text?: string) {
  return (text ?? "")
    .split(/\n/)
    .map((line) => line.replace(/^[•·\-\u2013\u2014]\s*/, "").trim())
    .filter(Boolean)
    .map((line) => `• ${line}`)
    .join("\n");
}

export function serializeNodeContent(sourceContent?: string, aiContent?: string) {
  const normalizedSource = normalizeBulletText(sourceContent);
  const normalizedAi = normalizeBulletText(aiContent);

  return [
    CONTENT_SOURCE_START,
    normalizedSource,
    CONTENT_SOURCE_END,
    CONTENT_AI_START,
    normalizedAi,
    CONTENT_AI_END
  ].join("\n");
}

export function parseNodeContent(content: string) {
  const sourceMatch = content.match(/\[\[SOURCE\]\]\n?([\s\S]*?)\n?\[\[\/SOURCE\]\]/);
  const aiMatch = content.match(/\[\[AI\]\]\n?([\s\S]*?)\n?\[\[\/AI\]\]/);

  if (!sourceMatch && !aiMatch) {
    return {
      sourceContent: normalizeBulletText(content),
      aiContent: ""
    };
  }

  return {
    sourceContent: normalizeBulletText(sourceMatch?.[1] ?? ""),
    aiContent: normalizeBulletText(aiMatch?.[1] ?? "")
  };
}

export function getNodeDisplayContent(node: Pick<MindMapNode, "content" | "sourceContent" | "aiContent">) {
  const parsed = parseNodeContent(node.content);

  return {
    sourceContent: node.sourceContent ?? parsed.sourceContent,
    aiContent: node.aiContent ?? parsed.aiContent
  };
}

export function getNodeCombinedContent(node: Pick<MindMapNode, "content" | "sourceContent" | "aiContent">) {
  const { sourceContent, aiContent } = getNodeDisplayContent(node);
  return [sourceContent, aiContent].filter(Boolean).join("\n");
}

function toBulletSummaryFromParts(sourceContent?: string, aiContent?: string) {
  const lines = [normalizeBulletText(sourceContent), normalizeBulletText(aiContent)]
    .filter(Boolean)
    .join("\n")
    .split(/\n/)
    .filter(Boolean);

  return lines.slice(0, 3).join("\n");
}

function getRadius(depth: number) {
  return Math.max(RADIUS_MIN, RADIUS_BASE * Math.pow(RADIUS_DECAY, depth));
}

function projectPoint(originX: number, originY: number, angle: number, radius: number) {
  return {
    x: originX + Math.cos(angle) * radius * X_STRETCH,
    y: originY + Math.sin(angle) * radius * Y_STRETCH
  };
}

function clampSpan(span: number, childCount: number) {
  const minSpan = Math.min(MIN_CHILD_SPAN * childCount, Math.PI * 1.72);
  return Math.max(span, minSpan);
}

function countLeaves(node: TopicTreeNode): number {
  if (!node.children?.length) return 1;
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

function makeNode(
  id: string,
  parentId: string | null,
  treeNode: TopicTreeNode,
  x: number,
  y: number,
  depth: number,
  orderIndex: number,
  color: string
): MindMapNode {
  const sourceContent = normalizeBulletText(treeNode.sourceContent || treeNode.content);
  const aiContent = normalizeBulletText(treeNode.aiContent);
  const importanceWeight = Number.isFinite(treeNode.importanceWeight) ? Number(treeNode.importanceWeight) : undefined;

  return {
    id,
    parentId,
    title: treeNode.title,
    content: serializeNodeContent(sourceContent, aiContent),
    summary: toBulletSummaryFromParts(sourceContent, aiContent),
    sourceContent,
    aiContent,
    color,
    depth,
    orderIndex,
    aiGenerated: Boolean(aiContent),
    importanceWeight,
    x: Math.round(x),
    y: Math.round(y)
  };
}

function layoutRadialSubtree(
  treeNode: TopicTreeNode,
  parentId: string,
  parentX: number,
  parentY: number,
  angleStart: number,
  angleEnd: number,
  depth: number,
  color: string,
  orderIndex: number,
  results: MindMapNode[]
): string {
  const nodeId = crypto.randomUUID();
  const angle = (angleStart + angleEnd) / 2;
  const radius = getRadius(depth - 1);
  const { x, y } = projectPoint(parentX, parentY, angle, radius);

  results.push(makeNode(nodeId, parentId, treeNode, x, y, depth, orderIndex, color));

  const children = treeNode.children ?? [];
  if (children.length === 0) return nodeId;

  const rawSpan = angleEnd - angleStart;
  const distributedSpan = clampSpan(rawSpan, children.length);
  const spreadStart = angle - distributedSpan / 2;
  const spreadEnd = angle + distributedSpan / 2;
  const totalLeaves = children.reduce((sum, child) => sum + countLeaves(child), 0);
  let currentAngle = spreadStart;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const childLeaves = countLeaves(child);
    const childSpan = (childLeaves / totalLeaves) * (spreadEnd - spreadStart);

    layoutRadialSubtree(
      child,
      nodeId,
      x,
      y,
      currentAngle,
      currentAngle + childSpan,
      depth + 1,
      color,
      i,
      results
    );

    currentAngle += childSpan;
  }

  return nodeId;
}

function buildChildrenMap(nodes: MindMapNode[]): Map<string, MindMapNode[]> {
  const childrenMap = new Map<string, MindMapNode[]>();

  for (const node of nodes) {
    if (!node.parentId) continue;
    const siblings = childrenMap.get(node.parentId) ?? [];
    siblings.push(node);
    childrenMap.set(node.parentId, siblings);
  }

  for (const siblings of childrenMap.values()) {
    siblings.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  return childrenMap;
}

function countFlatLeaves(nodeId: string, childrenMap: Map<string, MindMapNode[]>): number {
  const children = childrenMap.get(nodeId) ?? [];
  if (children.length === 0) return 1;
  return children.reduce((sum, child) => sum + countFlatLeaves(child.id, childrenMap), 0);
}

function rebalanceSubtree(
  node: MindMapNode,
  childrenMap: Map<string, MindMapNode[]>,
  positioned: Map<string, MindMapNode>,
  parentX: number,
  parentY: number,
  angleStart: number,
  angleEnd: number,
  depth: number
) {
  const angle = (angleStart + angleEnd) / 2;
  const radius = getRadius(Math.max(depth - 1, 0));
  const { x, y } = projectPoint(parentX, parentY, angle, radius);

  positioned.set(node.id, {
    ...node,
    x: Math.round(x),
    y: Math.round(y)
  });

  const children = childrenMap.get(node.id) ?? [];
  if (children.length === 0) return;

  const rawSpan = angleEnd - angleStart;
  const distributedSpan = clampSpan(rawSpan, children.length);
  const spreadStart = angle - distributedSpan / 2;
  const spreadEnd = angle + distributedSpan / 2;
  const totalLeaves = children.reduce((sum, child) => sum + countFlatLeaves(child.id, childrenMap), 0);
  let currentAngle = spreadStart;

  for (const child of children) {
    const childSpan = (countFlatLeaves(child.id, childrenMap) / totalLeaves) * (spreadEnd - spreadStart);
    rebalanceSubtree(child, childrenMap, positioned, x, y, currentAngle, currentAngle + childSpan, depth + 1);
    currentAngle += childSpan;
  }
}

function getBounds(nodes: MindMapNode[]) {
  if (nodes.length === 0) {
    return { width: 0, height: 0 };
  }

  let minX = nodes[0].x;
  let maxX = nodes[0].x;
  let minY = nodes[0].y;
  let maxY = nodes[0].y;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }

  return {
    width: maxX - minX,
    height: maxY - minY
  };
}

type LayoutNode = MindMapNode & { rootBranchId: string };

function getRootBranchId(nodeId: string, nodeMap: Map<string, MindMapNode>) {
  let current = nodeMap.get(nodeId);
  if (!current) return nodeId;

  while (current?.parentId) {
    const parent = nodeMap.get(current.parentId);
    if (!parent || parent.parentId === null) {
      return current.id;
    }
    current = parent;
  }

  return current?.id ?? nodeId;
}

function rectanglesOverlap(a: LayoutNode, b: LayoutNode) {
  return (
    Math.abs(a.x - b.x) < NODE_WIDTH + NODE_MARGIN_X &&
    Math.abs(a.y - b.y) < NODE_HEIGHT + NODE_MARGIN_Y
  );
}

function getSubtreeBounds(
  layoutMap: Map<string, LayoutNode>,
  childrenMap: Map<string, MindMapNode[]>,
  nodeId: string
) {
  const root = layoutMap.get(nodeId);
  if (!root) return null;

  let minX = root.x;
  let maxX = root.x;
  let minY = root.y;
  let maxY = root.y;

  function visit(currentId: string) {
    const current = layoutMap.get(currentId);
    if (!current) return;

    minX = Math.min(minX, current.x);
    maxX = Math.max(maxX, current.x);
    minY = Math.min(minY, current.y);
    maxY = Math.max(maxY, current.y);

    const children = childrenMap.get(currentId) ?? [];
    for (const child of children) visit(child.id);
  }

  visit(nodeId);

  return { minX, maxX, minY, maxY };
}

function branchBoxesOverlap(
  a: { minX: number; maxX: number; minY: number; maxY: number },
  b: { minX: number; maxX: number; minY: number; maxY: number }
) {
  return !(
    a.maxX + NODE_MARGIN_X < b.minX ||
    b.maxX + NODE_MARGIN_X < a.minX ||
    a.maxY + NODE_MARGIN_Y < b.minY ||
    b.maxY + NODE_MARGIN_Y < a.minY
  );
}

function moveSubtree(layoutMap: Map<string, LayoutNode>, childrenMap: Map<string, MindMapNode[]>, nodeId: string, dx: number, dy: number) {
  const node = layoutMap.get(nodeId);
  if (!node) return;

  node.x += dx;
  node.y += dy;

  const children = childrenMap.get(nodeId) ?? [];
  for (const child of children) {
    moveSubtree(layoutMap, childrenMap, child.id, dx, dy);
  }
}

function separateRootBranches(layoutMap: Map<string, LayoutNode>, childrenMap: Map<string, MindMapNode[]>, rootId: string) {
  const rootChildren = (childrenMap.get(rootId) ?? []).map((child) => layoutMap.get(child.id)).filter(Boolean) as LayoutNode[];
  if (rootChildren.length < 2) return;

  for (let iteration = 0; iteration < 12; iteration++) {
    let moved = false;

    for (let i = 0; i < rootChildren.length; i++) {
      for (let j = i + 1; j < rootChildren.length; j++) {
        const first = rootChildren[i];
        const second = rootChildren[j];
        const firstBounds = getSubtreeBounds(layoutMap, childrenMap, first.id);
        const secondBounds = getSubtreeBounds(layoutMap, childrenMap, second.id);
        if (!firstBounds || !secondBounds || !branchBoxesOverlap(firstBounds, secondBounds)) continue;

        const rootDx = second.x - first.x || (j % 2 === 0 ? 1 : -1);
        const rootDy = second.y - first.y || (i % 2 === 0 ? 1 : -1);
        const distance = Math.hypot(rootDx, rootDy) || 1;
        const overlapX = Math.min(firstBounds.maxX, secondBounds.maxX) - Math.max(firstBounds.minX, secondBounds.minX);
        const overlapY = Math.min(firstBounds.maxY, secondBounds.maxY) - Math.max(firstBounds.minY, secondBounds.minY);
        const shift = Math.max(overlapX, overlapY, 0) + 90;

        moveSubtree(
          layoutMap,
          childrenMap,
          second.id,
          (rootDx / distance) * shift,
          (rootDy / distance) * shift * 0.7
        );
        moved = true;
      }
    }

    if (!moved) break;
  }
}

function resolveInitialOverlaps(nodes: MindMapNode[]) {
  const nodeMap = new Map<string, MindMapNode>(nodes.map((node) => [node.id, node]));
  const childrenMap = buildChildrenMap(nodes);
  const layoutMap = new Map<string, LayoutNode>(
    nodes.map((node) => [
      node.id,
      {
        ...node,
        rootBranchId: node.parentId ? getRootBranchId(node.id, nodeMap) : node.id
      }
    ])
  );

  const root = nodes.find((node) => node.parentId === null);
  if (root) {
    separateRootBranches(layoutMap, childrenMap, root.id);
  }

  for (let iteration = 0; iteration < 18; iteration++) {
    let moved = false;
    const currentNodes = Array.from(layoutMap.values()).sort((a, b) => a.depth - b.depth);

    for (let i = 0; i < currentNodes.length; i++) {
      for (let j = i + 1; j < currentNodes.length; j++) {
        const first = currentNodes[i];
        const second = currentNodes[j];

        if (!rectanglesOverlap(first, second)) continue;

        const sameBranch = first.rootBranchId === second.rootBranchId;
        if (!sameBranch) continue;
        const dx = second.x - first.x || (i % 2 === 0 ? 1 : -1);
        const dy = second.y - first.y || (j % 2 === 0 ? 1 : -1);
        const distance = Math.hypot(dx, dy) || 1;
        const overlapX = NODE_WIDTH + NODE_MARGIN_X - Math.abs(dx);
        const overlapY = NODE_HEIGHT + NODE_MARGIN_Y - Math.abs(dy);

        const pushX = ((overlapX + (sameBranch ? 10 : 36)) * dx) / distance;
        const pushY = ((overlapY + (sameBranch ? 12 : 18)) * dy) / distance;

        const target = second.depth >= first.depth ? second : first;
        const shiftX = target === second ? pushX : -pushX;
        const shiftY = target === second ? pushY : -pushY;

        moveSubtree(layoutMap, childrenMap, target.id, shiftX, shiftY);
        moved = true;
      }
    }

    if (!moved) break;
  }

  return nodes.map((node) => {
    const next = layoutMap.get(node.id);
    return next ? { ...node, x: Math.round(next.x), y: Math.round(next.y) } : node;
  });
}

export function topicTreeToNodes(tree: TopicTree): MindMapNode[] {
  const results: MindMapNode[] = [];
  const rootId = crypto.randomUUID();

  results.push(makeNode(rootId, null, tree, 0, 0, 0, 0, "#ffffff"));

  const children = tree.children ?? [];
  if (children.length === 0) return results;

  const totalLeaves = children.reduce((sum, child) => sum + countLeaves(child), 0);
  let currentAngle = ROOT_START_ANGLE;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const childLeaves = countLeaves(child);
    const angularSpan = (childLeaves / totalLeaves) * 2 * Math.PI;
    const color = BRANCH_COLORS[i % BRANCH_COLORS.length];

    layoutRadialSubtree(
      child,
      rootId,
      0,
      0,
      currentAngle,
      currentAngle + angularSpan,
      1,
      color,
      i,
      results
    );

    currentAngle += angularSpan;
  }

  return resolveInitialOverlaps(results);
}

export function rebalanceFlatMindMapNodes(nodes: MindMapNode[]) {
  if (nodes.length < 3) return nodes;

  const root = nodes.find((node) => node.parentId === null);
  if (!root) return nodes;

  const currentBounds = getBounds(nodes);
  let nextNodes = nodes;

  if (currentBounds.width < currentBounds.height * 1.1) {
    const childrenMap = buildChildrenMap(nodes);
    const rootChildren = childrenMap.get(root.id) ?? [];
    if (rootChildren.length > 0) {
      const positioned = new Map<string, MindMapNode>();
      positioned.set(root.id, { ...root, x: 0, y: 0 });

      const totalLeaves = rootChildren.reduce((sum, child) => sum + countFlatLeaves(child.id, childrenMap), 0);
      let currentAngle = ROOT_START_ANGLE;

      for (const child of rootChildren) {
        const span = (countFlatLeaves(child.id, childrenMap) / totalLeaves) * 2 * Math.PI;
        rebalanceSubtree(child, childrenMap, positioned, 0, 0, currentAngle, currentAngle + span, 1);
        currentAngle += span;
      }

      nextNodes = nodes.map((node) => positioned.get(node.id) ?? node);
    }
  }

  return resolveInitialOverlaps(nextNodes);
}

export function getScopeNodes(nodes: MindMapNode[], scopeNodeId?: string) {
  if (!scopeNodeId) return nodes;

  const childrenMap = buildChildrenMap(nodes);
  const scoped = new Set<string>();

  function visit(nodeId: string) {
    scoped.add(nodeId);
    const children = childrenMap.get(nodeId) ?? [];
    for (const child of children) visit(child.id);
  }

  visit(scopeNodeId);
  return nodes.filter((node) => scoped.has(node.id));
}

export function buildMapContext(nodes: MindMapNode[], scopeNodeId?: string) {
  const scopedNodes = getScopeNodes(nodes, scopeNodeId);

  return scopedNodes
    .map((node) => `${"  ".repeat(node.depth)}- ${node.title}: ${getNodeCombinedContent(node)}`)
    .join("\n");
}

export function normalizeImportanceWeight(value?: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0.1, Number(value)));
}

export function applyFallbackImportanceWeights(nodes: MindMapNode[]) {
  return nodes.map((node) => {
    if (Number.isFinite(node.importanceWeight)) {
      return { ...node, importanceWeight: normalizeImportanceWeight(node.importanceWeight) };
    }

    const sourceLines = getNodeDisplayContent(node).sourceContent.split("\n").filter(Boolean).length;
    const aiLines = getNodeDisplayContent(node).aiContent.split("\n").filter(Boolean).length;
    const contentFactor = Math.min(0.35, (sourceLines * 0.025) + (aiLines * 0.02));
    const depthFactor = Math.max(0, 0.22 - Math.min(node.depth, 5) * 0.04);
    const titleFactor = node.title.length > 42 ? 0.03 : 0.08;
    const fallback = 0.35 + contentFactor + depthFactor + titleFactor;

    return { ...node, importanceWeight: normalizeImportanceWeight(fallback) };
  });
}

export function buildWeightedMapContext(nodes: MindMapNode[], scopeNodeId?: string) {
  const scopedNodes = applyFallbackImportanceWeights(getScopeNodes(nodes, scopeNodeId));

  return scopedNodes
    .map((node) => {
      const weight = normalizeImportanceWeight(node.importanceWeight);
      return `${"  ".repeat(node.depth)}- ${node.title} [weight:${weight.toFixed(2)}]: ${getNodeCombinedContent(node)}`;
    })
    .join("\n");
}

export function getImportanceCriteriaText() {
  return [
    "1) Concept centrality: how foundational the node is to understanding parent and downstream topics.",
    "2) Source emphasis: how often or strongly the source material emphasizes the concept.",
    "3) Revision relevance: whether the node captures definitions, frameworks, processes, or high-yield comparisons.",
    "4) Dependency impact: whether mastering this node unlocks multiple related nodes.",
    "5) Practical significance: how directly the concept supports analysis, decision-making, or real-world application."
  ].join("\n");
}
