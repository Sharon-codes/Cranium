"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, FileText, LocateFixed, Sparkles } from "lucide-react";

import type { MindMapDocument, RevisionItem, RevisionScope, RevisionSet, RevisionType } from "@/types";

interface RevisionPanelProps {
  map: MindMapDocument;
  existingSets: RevisionSet[];
}

type ObjectiveState = {
  selectedOption: string;
  submitted: boolean;
};

type SubjectiveState = {
  answer: string;
  feedback?: string;
};

type ScopeOption = {
  id: string;
  title: string;
  color: string;
};

function locateNode(nodeId?: string) {
  if (!nodeId) return;
  window.dispatchEvent(new CustomEvent("mindmap:locate-node", { detail: { nodeId } }));
}

function parseSubjectiveScore(feedback?: string) {
  const match = feedback?.match(/(\d+(?:\.\d+)?)\s*\/\s*10|score[^0-9]*(\d+(?:\.\d+)?)\s*(?:out of\s*10)?/i);
  const value = Number(match?.[1] ?? match?.[2]);
  return Number.isFinite(value) ? value : null;
}

function getTopBranchId(nodeId: string, nodes: MindMapDocument["nodes"]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  let current = nodeMap.get(nodeId);
  while (current?.parentId) {
    const parent = nodeMap.get(current.parentId);
    if (!parent) break;
    if (parent.parentId === null) return current.id;
    current = parent;
  }
  return current?.id ?? nodeId;
}

function SourceBadge({ item }: { item: RevisionItem }) {
  const isAi = item.sourceLabel === "AI content";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
        isAi ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {isAi ? <Sparkles className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
      {item.sourceLabel ?? "Uploaded files"}
    </span>
  );
}

function ScopeMultiSelect({
  label,
  placeholder,
  options,
  selectedIds,
  onChange,
  emptyText
}: {
  label: string;
  placeholder: string;
  options: ScopeOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyText: string;
}) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedNames = options.filter((option) => selectedSet.has(option.id)).map((option) => option.title);

  function toggle(optionId: string) {
    if (selectedSet.has(optionId)) {
      onChange(selectedIds.filter((id) => id !== optionId));
      return;
    }
    onChange([...selectedIds, optionId]);
  }

  return (
    <div className="text-sm">
      <span className="mb-2 block font-medium">{label}</span>
      <details className="group relative">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-700">
          <span className="truncate">
            {selectedNames.length ? `${selectedNames.length} selected: ${selectedNames.join(", ")}` : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" />
        </summary>
        <div className="absolute z-10 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-soft">
          {options.length ? (
            options.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selectedSet.has(option.id)}
                  onChange={() => toggle(option.id)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="h-3 w-3 rounded-full border border-slate-200" style={{ backgroundColor: option.color }} />
                <span className="text-slate-700">{option.title}</span>
              </label>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-slate-500">{emptyText}</p>
          )}
        </div>
      </details>
    </div>
  );
}

export function RevisionPanel({ map, existingSets }: RevisionPanelProps) {
  const [scope, setScope] = useState<RevisionScope>("all");
  const [type, setType] = useState<RevisionType>("flashcards");
  const [count, setCount] = useState(6);
  const [includeAiGenerated, setIncludeAiGenerated] = useState(false);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [sets, setSets] = useState(existingSets);
  const [isPending, startTransition] = useTransition();
  const [view, setView] = useState<"form" | "slideshow">(existingSets.length > 0 ? "slideshow" : "form");
  const [slideIndex, setSlideIndex] = useState(0);
  const [objectiveState, setObjectiveState] = useState<Record<string, ObjectiveState>>({});
  const [subjectiveState, setSubjectiveState] = useState<Record<string, SubjectiveState>>({});

  const rootNode = useMemo(() => map.nodes.find((node) => node.parentId === null) ?? null, [map.nodes]);
  const branchOptions = useMemo(
    () =>
      map.nodes
        .filter((node) => node.depth === 1 && (!rootNode || node.parentId === rootNode.id))
        .map((node) => ({ id: node.id, title: node.title, color: node.color })),
    [map.nodes, rootNode]
  );
  const selectedBranchSet = useMemo(() => new Set(selectedBranchIds), [selectedBranchIds]);
  const nodeOptions = useMemo(() => {
    if (selectedBranchSet.size === 0) return [];
    return map.nodes
      .filter((node) => node.depth > 1 && node.parentId && selectedBranchSet.has(getTopBranchId(node.id, map.nodes)))
      .map((node) => ({ id: node.id, title: node.title, color: node.color }));
  }, [map.nodes, selectedBranchSet]);
  const nodeOptionIds = useMemo(() => new Set(nodeOptions.map((node) => node.id)), [nodeOptions]);
  const primaryScopeNodeId = selectedNodeIds[0] ?? selectedBranchIds[0] ?? map.nodes[0]?.id ?? "";
  const activeSet = sets[0] ?? null;

  useEffect(() => {
    setSelectedNodeIds((current) => current.filter((id) => nodeOptionIds.has(id)));
  }, [nodeOptionIds]);

  const hasResultsSlide = useMemo(() => {
    if (!activeSet || activeSet.type === "flashcards") return false;

    if (activeSet.type === "objective") {
      return activeSet.items.every((item) => objectiveState[item.id]?.submitted);
    }

    return activeSet.items.every((item) => Boolean(subjectiveState[item.id]?.feedback));
  }, [activeSet, objectiveState, subjectiveState]);

  const totalSlides = (activeSet?.items.length ?? 0) + (hasResultsSlide ? 1 : 0);
  const isSummarySlide = Boolean(activeSet) && hasResultsSlide && slideIndex === activeSet.items.length;
  const activeItem = activeSet && !isSummarySlide ? activeSet.items[slideIndex] : null;

  const objectiveSummary = useMemo(() => {
    if (!activeSet || activeSet.type !== "objective") return null;

    const wrongItems = activeSet.items.filter((item) => {
      const state = objectiveState[item.id];
      return state?.submitted && state.selectedOption !== item.answer;
    });

    const correctCount = activeSet.items.filter((item) => {
      const state = objectiveState[item.id];
      return state?.submitted && state.selectedOption === item.answer;
    }).length;

    return {
      correctCount,
      wrongCount: wrongItems.length,
      wrongItems
    };
  }, [activeSet, objectiveState]);

  const subjectiveSummary = useMemo(() => {
    if (!activeSet || activeSet.type !== "subjective") return null;

    const scores = activeSet.items.map((item) => ({
      item,
      score: parseSubjectiveScore(subjectiveState[item.id]?.feedback)
    }));

    const wrongItems = scores.filter(({ score }) => score !== null && score < 7).map(({ item }) => item);
    const correctCount = scores.filter(({ score }) => score !== null && score >= 7).length;

    return {
      correctCount,
      wrongCount: wrongItems.length,
      wrongItems
    };
  }, [activeSet, subjectiveState]);

  async function generateSet() {
    startTransition(async () => {
      const response = await fetch(`/api/maps/${map.id}/revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          type,
          count,
          includeAiGenerated,
          nodeId: primaryScopeNodeId,
          selectedBranchIds,
          selectedNodeIds
        })
      });

      const payload = await response.json();
      if (payload.set) {
        setSets([payload.set]);
        setObjectiveState({});
        setSubjectiveState({});
        setSlideIndex(0);
        setView("slideshow");
      }
    });
  }

  async function evaluateAnswer(item: RevisionItem, answer: string) {
    const response = await fetch(`/api/maps/${map.id}/revision`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: item.prompt,
        answer,
        allowGeneralKnowledge: includeAiGenerated,
        nodeId: item.sourceNodeId ?? primaryScopeNodeId
      })
    });

    const payload = await response.json();
    setSubjectiveState((current) => ({
      ...current,
      [item.id]: { answer, feedback: payload.feedback }
    }));
  }

  function goBack() {
    setView("form");
  }

  function prevSlide() {
    setSlideIndex((index) => Math.max(0, index - 1));
  }

  function nextSlide() {
    setSlideIndex((index) => Math.min(totalSlides - 1, index + 1));
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      {view === "form" ? (
        <>
          <div>
            <h2 className="text-xl font-semibold">Revision mode</h2>
            <p className="text-sm text-slate-500">Generate flashcards, MCQs, or subjective prompts from your map.</p>
          </div>

          <div className="mt-6 grid gap-4">
            <label className="text-sm">
              <span className="mb-2 block font-medium">Scope</span>
              <select
                className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                value={scope}
                onChange={(e) => {
                  const nextScope = e.target.value as RevisionScope;
                  setScope(nextScope);
                  setSelectedBranchIds([]);
                  setSelectedNodeIds([]);
                }}
              >
                <option value="all">All nodes</option>
                <option value="branch">Selected branch</option>
                <option value="node">Selected node</option>
              </select>
            </label>

            {scope === "branch" ? (
              <ScopeMultiSelect
                label="Select branch"
                placeholder="Choose one or more branches"
                options={branchOptions}
                selectedIds={selectedBranchIds}
                onChange={setSelectedBranchIds}
                emptyText="No branches available."
              />
            ) : null}

            {scope === "node" ? (
              <>
                <ScopeMultiSelect
                  label="Select branch"
                  placeholder="Choose one or more branches"
                  options={branchOptions}
                  selectedIds={selectedBranchIds}
                  onChange={setSelectedBranchIds}
                  emptyText="No branches available."
                />
                <ScopeMultiSelect
                  label="Select node"
                  placeholder="Choose one or more nodes"
                  options={nodeOptions}
                  selectedIds={selectedNodeIds}
                  onChange={setSelectedNodeIds}
                  emptyText="Select branch first to load nodes."
                />
              </>
            ) : null}

            <label className="text-sm">
              <span className="mb-2 block font-medium">Type</span>
              <select
                className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                value={type}
                onChange={(e) => setType(e.target.value as RevisionType)}
              >
                <option value="flashcards">Flashcards</option>
                <option value="objective">Objective questions</option>
                <option value="subjective">Subjective questions</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-2 block font-medium">Count</span>
              <input
                className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={includeAiGenerated}
                onChange={(e) => setIncludeAiGenerated(e.target.checked)}
              />
              Include AI-generated content
            </label>
          </div>

          <button
            type="button"
            onClick={generateSet}
            disabled={
              isPending ||
              (scope === "branch" && selectedBranchIds.length === 0) ||
              (scope === "node" && (selectedBranchIds.length === 0 || selectedNodeIds.length === 0))
            }
            className="mt-5 w-full rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            {isPending ? "Generating..." : "Generate revision set"}
          </button>

          {activeSet ? (
            <button
              type="button"
              onClick={() => {
                setSlideIndex(0);
                setView("slideshow");
              }}
              className="mt-3 w-full rounded-full border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400"
            >
              View current set ({activeSet.items.length} items)
            </button>
          ) : null}
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goBack}
              className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              title="Back to revision settings"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">{activeSet?.title || "Revision Set"}</h2>
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium uppercase text-slate-600">
                  {activeSet?.type}
                </span>
                <span className="text-xs text-slate-400">
                  {slideIndex + 1} / {Math.max(totalSlides, 1)}
                </span>
              </div>
            </div>
          </div>

          {activeSet && activeItem ? (
            <div className="mt-5">
              <SlideContent
                key={activeItem.id}
                set={activeSet}
                item={activeItem}
                objectiveState={objectiveState[activeItem.id]}
                subjectiveState={subjectiveState[activeItem.id]}
                onObjectiveChange={(state) =>
                  setObjectiveState((current) => ({ ...current, [activeItem.id]: state }))
                }
                onSubjectiveChange={(state) =>
                  setSubjectiveState((current) => ({ ...current, [activeItem.id]: state }))
                }
                onEvaluate={evaluateAnswer}
              />
            </div>
          ) : null}

          {activeSet && isSummarySlide ? (
            <ResultsSlide
              type={activeSet.type}
              objectiveSummary={objectiveSummary}
              subjectiveSummary={subjectiveSummary}
            />
          ) : null}

          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={prevSlide}
              disabled={slideIndex === 0}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>

            <div className="flex gap-1.5">
              {Array.from({ length: Math.max(totalSlides, 1) }).map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setSlideIndex(index)}
                  className={`h-2 w-2 rounded-full transition ${
                    index === slideIndex ? "scale-125 bg-slate-700" : "bg-slate-300"
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={nextSlide}
              disabled={slideIndex >= totalSlides - 1}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-30"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SlideContent({
  set,
  item,
  objectiveState,
  subjectiveState,
  onObjectiveChange,
  onSubjectiveChange,
  onEvaluate
}: {
  set: RevisionSet;
  item: RevisionItem;
  objectiveState?: ObjectiveState;
  subjectiveState?: SubjectiveState;
  onObjectiveChange: (state: ObjectiveState) => void;
  onSubjectiveChange: (state: SubjectiveState) => void;
  onEvaluate: (item: RevisionItem, answer: string) => Promise<void>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge item={item} />
        {item.sourceNodeTitle ? <span className="text-xs text-slate-500">{item.sourceNodeTitle}</span> : null}
        {item.sourceNodeId ? (
          <button
            type="button"
            onClick={() => locateNode(item.sourceNodeId)}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
          >
            <LocateFixed className="h-3.5 w-3.5" />
            Locate
          </button>
        ) : null}
      </div>

      {set.type === "flashcards" ? <Flashcard item={item} /> : null}
      {set.type === "objective" ? (
        <ObjectiveCard item={item} state={objectiveState} onChange={onObjectiveChange} />
      ) : null}
      {set.type === "subjective" ? (
        <SubjectiveCard
          item={item}
          state={subjectiveState}
          onChange={onSubjectiveChange}
          onEvaluate={onEvaluate}
        />
      ) : null}
    </div>
  );
}

function Flashcard({ item }: { item: RevisionItem }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-slate-800">{item.prompt}</p>
      <button type="button" onClick={() => setFlipped((current) => !current)} className="mt-4 h-44 w-full [perspective:1000px]">
        <div
          className="relative h-full w-full rounded-2xl transition duration-500 [transform-style:preserve-3d]"
          style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
        >
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white p-5 [backface-visibility:hidden]">
            <p className="text-center text-sm text-slate-600">Tap to reveal answer</p>
          </div>
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900 p-5 text-white [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <p className="text-center text-sm">{item.answer}</p>
          </div>
        </div>
      </button>
    </div>
  );
}

function ObjectiveCard({
  item,
  state,
  onChange
}: {
  item: RevisionItem;
  state?: ObjectiveState;
  onChange: (state: ObjectiveState) => void;
}) {
  const selectedOption = state?.selectedOption ?? "";
  const submitted = state?.submitted ?? false;

  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-slate-800">{item.prompt}</p>
      <div className="mt-4 space-y-2">
        {(item.options || []).map((option) => {
          let optionStyle = "border-slate-200";
          if (submitted) {
            if (option === item.answer) optionStyle = "border-green-400 bg-green-50";
            else if (option === selectedOption) optionStyle = "border-red-400 bg-red-50";
          }

          return (
            <label key={option} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${optionStyle}`}>
              <input
                type="radio"
                name={item.id}
                value={option}
                checked={selectedOption === option}
                disabled={submitted}
                onChange={(e) => onChange({ selectedOption: e.target.value, submitted: false })}
              />
              <span>{option}</span>
            </label>
          );
        })}
      </div>
      {!submitted ? (
        <button
          type="button"
          className="mt-3 rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          onClick={() => onChange({ selectedOption, submitted: true })}
          disabled={!selectedOption}
        >
          Submit
        </button>
      ) : (
        <p className={`mt-3 text-xs font-medium ${selectedOption === item.answer ? "text-green-600" : "text-red-600"}`}>
          {selectedOption === item.answer ? "Correct." : `Incorrect. Answer: ${item.answer}`}
        </p>
      )}
      {item.explanation ? <p className="mt-3 text-xs leading-5 text-slate-500">{item.explanation}</p> : null}
    </div>
  );
}

function SubjectiveCard({
  item,
  state,
  onChange,
  onEvaluate
}: {
  item: RevisionItem;
  state?: SubjectiveState;
  onChange: (state: SubjectiveState) => void;
  onEvaluate: (item: RevisionItem, answer: string) => Promise<void>;
}) {
  const answer = state?.answer ?? "";

  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-slate-800">{item.prompt}</p>
      <textarea
        className="mt-4 h-28 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
        placeholder="Write your answer here..."
        value={answer}
        onChange={(e) => onChange({ ...state, answer: e.target.value })}
      />
      <button
        type="button"
        className="mt-3 rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
        onClick={() => onEvaluate(item, answer)}
        disabled={!answer.trim()}
      >
        Evaluate answer
      </button>
      {state?.feedback ? (
        <div className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-4 text-sm text-slate-600">{state.feedback}</div>
      ) : null}
    </div>
  );
}

function ResultsSlide({
  type,
  objectiveSummary,
  subjectiveSummary
}: {
  type: RevisionType;
  objectiveSummary: { correctCount: number; wrongCount: number; wrongItems: RevisionItem[] } | null;
  subjectiveSummary: { correctCount: number; wrongCount: number; wrongItems: RevisionItem[] } | null;
}) {
  const summary = type === "objective" ? objectiveSummary : subjectiveSummary;

  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <h3 className="text-lg font-semibold text-slate-800">Results</h3>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Correct</p>
          <p className="mt-2 text-2xl font-semibold text-green-600">{summary?.correctCount ?? 0}</p>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Wrong</p>
          <p className="mt-2 text-2xl font-semibold text-rose-600">{summary?.wrongCount ?? 0}</p>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-sm font-medium text-slate-800">Topics to revisit</p>
        {summary?.wrongItems.length ? (
          <div className="mt-3 space-y-2">
            {summary.wrongItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">{item.sourceNodeTitle ?? "Related topic"}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.sourceLabel}</p>
                </div>
                {item.sourceNodeId ? (
                  <button
                    type="button"
                    onClick={() => locateNode(item.sourceNodeId)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                  >
                    <LocateFixed className="h-3.5 w-3.5" />
                    Locate
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No incorrect topics to revisit in this set.</p>
        )}
      </div>
    </div>
  );
}
