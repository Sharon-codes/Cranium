import OpenAI from "openai";
import { z } from "zod";

import type { RevisionType, TopicTree, TopicTreeNode } from "@/types";

const topicNodeSchema: z.ZodType<TopicTreeNode> = z.lazy(() =>
  z.object({
    title: z.string(),
    content: z.string(),
    sourceContent: z.string().optional(),
    aiContent: z.string().optional(),
    importanceWeight: z.number().min(0).max(1).optional(),
    children: z.array(topicNodeSchema).optional()
  })
);

const topicSchema: z.ZodType<TopicTree> = z.object({
  title: z.string(),
  content: z.string(),
  sourceContent: z.string().optional(),
  aiContent: z.string().optional(),
  importanceWeight: z.number().min(0).max(1).optional(),
  children: z.array(topicNodeSchema).optional()
});

const revisionSchema = z.object({
  title: z.string(),
  items: z.array(
    z.object({
      prompt: z.string(),
      answer: z.string(),
      options: z.array(z.string()).optional(),
      explanation: z.string().optional(),
      aiGenerated: z.boolean(),
      sourceLabel: z.enum(["Uploaded files", "AI content"]),
      sourceNodeId: z.string(),
      sourceNodeTitle: z.string()
    })
  )
});

function countTopicNodes(node: TopicTreeNode | TopicTree): number {
  return 1 + (node.children ?? []).reduce((sum, child) => sum + countTopicNodes(child), 0);
}

function getTreeDepth(node: TopicTreeNode | TopicTree): number {
  if (!node.children?.length) return 1;
  return 1 + Math.max(...node.children.map((child) => getTreeDepth(child)));
}

function getClient() {
  const apiKey = process.env.HF_API_KEY || process.env.GROK_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing AI API key. Set HF_API_KEY, GROK_API_KEY, or OPENAI_API_KEY.");
  }

  return new OpenAI({
    apiKey,
    baseURL:
      process.env.HF_BASE_URL ||
      process.env.GROK_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      "https://router.huggingface.co/v1"
  });
}

function getModel() {
  return (
    process.env.HF_MODEL ||
    process.env.GROK_MODEL ||
    process.env.OPENAI_MODEL ||
    "Qwen/Qwen2.5-72B-Instruct"
  );
}

function isHuggingFace() {
  return Boolean(process.env.HF_API_KEY);
}

async function generatePlainText(system: string, user: string) {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: getModel(),
    temperature: 0.2,
    max_tokens: 2048,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  });

  return response.choices[0]?.message?.content?.trim() || "";
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch) return objectMatch[0];

  return raw.trim();
}

async function generateJson<T>(params: {
  system: string;
  user: string;
  schemaName: string;
  validator: z.ZodSchema<T>;
}) {
  const client = getClient();
  const useJsonFormat = !isHuggingFace();

  const systemPrompt = `${params.system}

You MUST return ONLY valid JSON matching the requested shape. Do not wrap the response in markdown code fences. Do not include any text before or after the JSON.`;

  const requestBody: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model: getModel(),
    temperature: 0.2,
    max_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: params.user }
    ]
  };

  if (useJsonFormat) {
    requestBody.response_format = { type: "json_object" };
  }

  const response = await client.chat.completions.create(requestBody);
  const rawContent = response.choices[0]?.message?.content?.trim();

  if (!rawContent) {
    throw new Error(`Empty JSON response for ${params.schemaName}.`);
  }

  const cleanJson = extractJson(rawContent);

  try {
    return params.validator.parse(JSON.parse(cleanJson));
  } catch {
    console.error(`[AI] Failed to parse ${params.schemaName} response. Raw:\n${rawContent}`);
    throw new Error(`Invalid JSON response for ${params.schemaName}. The AI model returned malformed data.`);
  }
}

export async function generateTopicTree(input: { title: string; content: string }): Promise<TopicTree> {
  const baseTree = await generateJson({
    system: `You are an expert academic mind-map generator.

CRITICAL GOAL:
Produce a rich, deeply branched knowledge map, not a short outline. For substantial documents, the map should usually expand into many detailed subtopics across multiple levels.

CRITICAL RULES:
1. Preserve document-backed information in "sourceContent". This is the factual material directly supported by the uploaded file.
2. Use "aiContent" only for concise value-adding clarification, examples, synthesis, or connective insight that is not directly stated in the file.
3. Keep "content" as a combined preview string, but always provide the true split via "sourceContent" and optional "aiContent".
4. Do NOT compress a whole chapter into one node. Break major topics into smaller child nodes until each node represents one focused concept.
5. Favor 3-5 levels of depth when the document supports it.
6. For substantial study material, aim for approximately 30-80 total nodes unless the source is genuinely short.
7. Root should contain only a high-level overview. Major branches should represent big themes, and each major branch should further decompose into concrete subtopics, methods, examples, roles, challenges, tools, comparisons, or process steps where supported.
8. Do NOT skip important material from the uploaded file.
9. Every node should have concise explanatory bullet points, not just labels.
10. If the source naturally supports examples, applications, responsibilities, benefits, risks, workflows, components, or comparisons, split those into their own child nodes instead of flattening them into one parent node.
11. Each major branch should usually fan out into multiple concrete children when the source supports that level of detail.
12. Prefer branch diversity. If a topic has definitions, steps, tools, use cases, challenges, roles, outputs, comparisons, or examples, those should usually appear as separate child nodes instead of one merged paragraph.`,
    user: `Document title: ${input.title}

Document content:
${input.content.slice(0, 22000)}

Return a recursive JSON mind map. Each node has:
- "title"
- "content": combined preview text
- "sourceContent": bullet points from the uploaded document
- optional "aiContent": truly added explanatory bullet points
- optional "importanceWeight": number from 0 to 1 (higher means higher study priority within its parent level)
- optional "children"

Importance weighting criteria to apply for every node:
- Centrality to understanding parent concept and downstream topics
- Frequency/repetition/emphasis in the source
- Exam/revision relevance (definitions, frameworks, processes, key comparisons)
- Dependency value (prerequisite knowledge enabling multiple later nodes)
- Practical impact (used in analysis, decision-making, or problem-solving)

Make the map thorough and highly branched when the document contains enough information.

Example shape:
{
  "title": "root title",
  "content": "• file point 1\\n• file point 2",
  "sourceContent": "• file point 1\\n• file point 2",
  "aiContent": "• optional added explanation",
  "children": [
    {
      "title": "major topic",
      "content": "• file point 1\\n• optional added explanation",
      "sourceContent": "• file point 1",
      "aiContent": "• optional added explanation",
      "importanceWeight": 0.86,
      "children": [
        {
          "title": "specific subtopic",
          "content": "• focused detail",
          "sourceContent": "• focused detail",
          "importanceWeight": 0.73
        }
      ]
    }
  ]
}`,
    schemaName: "topic_tree",
    validator: topicSchema
  });

  const contentLength = input.content.trim().length;
  const nodeCount = countTopicNodes(baseTree);
  const treeDepth = getTreeDepth(baseTree);
  const shouldExpand = contentLength > 3500 && (nodeCount < 24 || treeDepth < 4);

  if (!shouldExpand) {
    return baseTree;
  }

  return generateJson({
    system: `You are refining a study mind map generated from an uploaded document.

CRITICAL GOAL:
Transform a sparse map into a rich, highly branched learning map while staying faithful to the source.

REFINEMENT RULES:
1. Preserve the same overall root topic.
2. Keep correct existing topics, but expand shallow branches significantly.
3. Break broad nodes into focused child nodes instead of long mixed bullet lists.
4. Favor 3-5 levels of depth when supported.
5. For substantial documents, target roughly 35-90 total nodes.
6. Increase branch diversity. Where supported by the source, create separate nodes for:
   definitions, components, process steps, responsibilities, methods, tools, examples, applications, benefits, risks, challenges, comparisons, outcomes, and best practices.
7. Do not invent factual claims not grounded in the document. Use "aiContent" only for light clarification, examples, or connective insight.
8. Keep every node concise and focused. One node should represent one concept, step, role, challenge, tool, example set, or comparison.
9. Avoid leaving major branches with only one shallow child unless the document is genuinely minimal.
10. Ensure each node has an "importanceWeight" from 0 to 1 based on study priority within its parent level.`,
    user: `Document title: ${input.title}

Document content:
${input.content.slice(0, 24000)}

Current map JSON:
${JSON.stringify(baseTree, null, 2)}

Return an improved recursive JSON map using the same schema:
- "title"
- "content"
- "sourceContent"
- optional "aiContent"
- optional "importanceWeight"
- optional "children"

Expand this map so uploaded-file mind maps feel detailed, varied, and study-ready.`,
    schemaName: "topic_tree_refined",
    validator: topicSchema
  });
}

export async function explainNode(input: { title: string; content: string; context: string; importanceWeight?: number }) {
  return generatePlainText(
    "You explain mind-map nodes clearly and briefly. Use the source context only. For high-weight topics (>=0.7), provide a richer explanation with one concrete example. For low-weight topics, keep it brief. Keep the response under 180 words. Do not use hashtags, markdown headings, or long lists. Use short paragraphs or concise bullets. Bold only a few important terms using **double asterisks**.",
    `Node: ${input.title}
Content: ${input.content}
Importance weight (0-1): ${input.importanceWeight ?? 0.5}

Source context:
${input.context.slice(0, 12000)}`
  );
}

export async function chatAboutMap(input: {
  question: string;
  selectedNodeTitle?: string;
  selectedNodeContent?: string;
  selectedNodeWeight?: number;
  mapContext: string;
  weightedContext?: string;
  originalText?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: getModel(),
    temperature: 0.3,
    max_tokens: 1400,
    messages: [
      {
        role: "system",
        content:
          "You are a study chatbot for a mind-map application. Answer the user's doubts clearly, conversationally, and helpfully. Use the uploaded source and map context as the main grounding. You may explain with examples and analogies when helpful, but do not invent unsupported factual claims about the source. Prefer clear paragraphs and short bullets. Keep formatting clean. High-weight topics deserve deeper explanations and richer examples; low-weight topics should be concise."
      },
      {
        role: "user",
        content: `Selected node: ${input.selectedNodeTitle ?? "None"}
Selected node weight (0-1): ${input.selectedNodeWeight ?? 0.5}
Selected node content:
${input.selectedNodeContent ?? "None"}

Map context:
${input.mapContext.slice(0, 12000)}

Weighted node context:
${(input.weightedContext ?? "").slice(0, 7000)}

Uploaded file text:
${(input.originalText ?? "").slice(0, 12000)}`
      },
      ...input.messages.map((message) => ({ role: message.role, content: message.content })),
      { role: "user", content: input.question }
    ]
  });

  return response.choices[0]?.message?.content?.trim() || "";
}

export async function summarizeText(text: string) {
  return generatePlainText("Summarize into 2-4 crisp bullet points, grounded in the source.", text);
}

export async function generateRevisionSet(input: {
  title: string;
  type: RevisionType;
  materials: Array<{
    nodeId: string;
    nodeTitle: string;
    sourceLabel: "Uploaded files" | "AI content";
    importanceWeight?: number;
    content: string;
  }>;
}) {
  return generateJson({
    system: `Generate high-quality ${input.type} revision material.

CRITICAL RULES:
1. Create exactly one item for each provided material entry.
2. Flashcards must be meaningful and study-worthy, not trivial rewrites.
3. Objective questions must include exactly 4 options and only one correct answer.
4. Subjective questions should invite a concise but thoughtful response.
5. Keep the supplied "sourceNodeId", "sourceNodeTitle", and "sourceLabel" unchanged in the output item that matches that material.
6. Set "aiGenerated" to true only when sourceLabel is "AI content". Otherwise set it to false.
7. If a material has higher "importanceWeight", make the prompt slightly deeper and more conceptually central.`,
    user: `Create one ${input.type} item per material entry.

Materials:
${JSON.stringify(input.materials, null, 2)}

Required JSON shape:
{
  "title": ${JSON.stringify(input.title)},
  "items": [
    {
      "prompt": "question or flashcard front",
      "answer": "answer",
      "options": ["a", "b", "c", "d"],
      "explanation": "optional explanation",
      "aiGenerated": false,
      "sourceLabel": "Uploaded files",
      "sourceNodeId": "node id",
      "sourceNodeTitle": "node title"
    }
  ]
}`,
    schemaName: "revision_set",
    validator: revisionSchema
  });
}

export async function evaluateSubjectiveAnswer(input: {
  prompt: string;
  answer: string;
  sourceContext: string;
  allowGeneralKnowledge: boolean;
}) {
  return generatePlainText(
    "Evaluate a student's short answer. Return concise feedback with a score out of 10, strengths, and one improvement.",
    `Question: ${input.prompt}
Answer: ${input.answer}
Allow general knowledge: ${input.allowGeneralKnowledge ? "yes" : "no"}

Source:
${input.sourceContext.slice(0, 10000)}`
  );
}
