import { llmClient, LLM_MODEL } from "./llm-client";
import { retrieveRelevantChunks } from "./retrieve";
import type { SourceReference } from "@/types";

/**
 * RAG 生成选项
 */
export interface GenerateOptions {
  /** 论文 ID */
  paperId: string;
  /** 用户问题 */
  question: string;
  /** 对话历史 */
  history?: { role: "user" | "assistant"; content: string }[];
  /** 检索的 chunk 数量 */
  topK?: number;
  /** 相似度阈值 */
  similarityThreshold?: number;
}

/**
 * RAG 生成结果
 */
export interface GenerateResult {
  answer: string;
  sources: SourceReference[];
}

/**
 * RAG 系统 Prompt
 */
const RAG_SYSTEM_PROMPT = `你是一个专业的学术论文分析助手。你的任务是基于提供的论文原文片段来回答用户的问题。

请严格遵守以下规则：
1. **基于原文**：你的回答必须严格基于提供的论文片段。如果片段中没有相关信息，请明确说明"根据提供的论文片段，无法回答此问题"。
2. **引用来源**：在回答中引用具体的片段编号，例如 [片段1]、[片段2]。
3. **保持准确**：不要编造、推测或添加论文中没有的信息。不要使用你的外部知识来补充论文内容。
4. **专业性**：使用清晰、专业的语言。专业术语保留英文原文，可以在括号中标注中文。
5. **简洁**：回答力求简洁准确，但涵盖所有相关要点。`.trim();

/**
 * 构建 RAG 用户 Prompt
 */
function buildRagPrompt(
  question: string,
  chunks: { index: number; content: string }[]
): string {
  const context = chunks
    .map(
      (c, i) =>
        `[片段${i + 1}]\n${c.content}\n`
    )
    .join("\n---\n");

  return `以下是从论文中检索到的相关片段：

${context}

用户的问题：${question}

请基于上面的片段回答用户的问题。回复时请引用具体片段编号。`.trim();
}

/**
 * 使用 RAG 生成答案（非流式）
 *
 * @param options - 生成选项
 * @returns 包含答案和引用来源的结果
 */
export async function generateRagAnswer(
  options: GenerateOptions
): Promise<GenerateResult> {
  const {
    paperId,
    question,
    history = [],
    topK = 5,
    similarityThreshold = 0.7,
  } = options;

  // 步骤 1: 检索相关片段
  const retrievalResults = await retrieveRelevantChunks(question, {
    documentId: paperId,
    limit: topK,
    similarityThreshold,
  });

  if (retrievalResults.length === 0) {
    return {
      answer: "抱歉，在论文中没有找到与您问题相关的片段。请尝试换一种方式提问，或者检查论文是否已成功索引。",
      sources: [],
    };
  }

  // 步骤 2: 构建 Prompt
  const chunks = retrievalResults.map((r) => ({
    index: r.chunk.chunk_index,
    content: r.chunk.content,
  }));

  const userPrompt = buildRagPrompt(question, chunks);

  // 步骤 3: 调用 LLM
  const response = await llmClient.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: RAG_SYSTEM_PROMPT },
      ...history.map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3, // 低温度以确保准确性
    max_tokens: 2000,
  });

  const answer = response.choices[0]?.message?.content || "无法生成回答。";

  // 构建来源引用
  const sources: SourceReference[] = retrievalResults.map((r) => ({
    chunk_index: r.chunk.chunk_index,
    content: r.chunk.content.slice(0, 200), // 截取前 200 字符作为预览
    page: (r.chunk.metadata as any)?.page,
    similarity: r.similarity,
  }));

  return { answer, sources };
}

export { RAG_SYSTEM_PROMPT };
