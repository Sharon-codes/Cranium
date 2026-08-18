export type RevisionType = "flashcards" | "objective" | "subjective";
export type RevisionScope = "all" | "branch" | "node";

export interface MindMapNode {
  id: string;
  parentId: string | null;
  mapId?: string;
  title: string;
  content: string;
  summary: string;
  sourceContent?: string;
  aiContent?: string;
  color: string;
  depth: number;
  orderIndex: number;
  aiGenerated: boolean;
  importanceWeight?: number;
  x: number;
  y: number;
}

export interface MindMapEdge {
  id: string;
  source: string;
  target: string;
}

export interface MindMapDocument {
  id: string;
  userId: string;
  title: string;
  sourceName: string | null;
  sourceType: string | null;
  originalText?: string;
  summaryMode: boolean;
  createdAt: string;
  updatedAt: string;
  nodes: MindMapNode[];
}

export interface RevisionItem {
  id: string;
  prompt: string;
  answer: string;
  options?: string[];
  explanation?: string;
  aiGenerated: boolean;
  sourceLabel?: "Uploaded files" | "AI content";
  sourceNodeId?: string;
  sourceNodeTitle?: string;
}

export interface RevisionSet {
  id: string;
  mapId: string;
  type: RevisionType;
  scope: RevisionScope;
  title: string;
  items: RevisionItem[];
  createdAt: string;
}

export interface ParsedDocument {
  title: string;
  content: string;
  sourceType: string;
}

export interface TopicTreeNode {
  title: string;
  content: string;
  sourceContent?: string;
  aiContent?: string;
  importanceWeight?: number;
  children?: TopicTreeNode[];
}

export type TopicTree = TopicTreeNode;
