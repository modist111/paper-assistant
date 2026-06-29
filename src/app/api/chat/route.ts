import { NextRequest } from "next/server";
import { llmClient, LLM_MODEL } from "@/lib/ai/llm-client";
import { retrieveRelevantChunks } from "@/lib/ai/retrieve";
import { RAG_SYSTEM_PROMPT } from "@/lib/ai/generate";
import type { SourceReference } from "@/types";

/**
 * POST /api/chat
 * 流式 RAG 问答 API
 *
 * 请求体 (JSON):
 * {
 *   paperId: string;        // 论文 ID
 *   question: string;       // 用户问题
 *   history?: { role, content }[];  // 对话历史
 * }
 *
 * 响应: Server-Sent Events (SSE) 流
 * - data: {"type":"chunk","content":"..."}       // 文本片段
 * - data: {"type":"sources","sources":[...]}     // 来源引用
 * - data: {"type":"done"}                        // 完成信号
 * - data: {"type":"error","message":"..."}       // 错误
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { paperId, question, history = [] } = body;

    if (!paperId || !question) {
      return new Response(
        JSON.stringify({ error: "缺少必要字段: paperId, question" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 步骤 1: 检索相关片段
    const retrievalResults = await retrieveRelevantChunks(question, {
      documentId: paperId,
      limit: 5,
      similarityThreshold: 0.7,
    });

    // 构建来源引用
    const sources: SourceReference[] = retrievalResults.map((r) => ({
      chunk_index: r.chunk.chunk_index,
      content: r.chunk.content.slice(0, 200),
      similarity: r.similarity,
      page: (r.chunk.metadata as any)?.page,
    }));

    if (retrievalResults.length === 0) {
      const stream = createSSEStream();
      stream.send("chunk", {
        content:
          "抱歉，在论文中没有找到与您问题相关的片段。请尝试换一种方式提问。",
      });
      stream.send("sources", { sources: [] });
      stream.send("done", {});
      return stream.close();
    }

    // 步骤 2: 构建 RAG Prompt
    const context = retrievalResults
      .map(
        (r, i) => `[片段${i + 1}]\n${r.chunk.content}\n`
      )
      .join("\n---\n");

    const userPrompt = `以下是从论文中检索到的相关片段：

${context}

用户的问题：${question}

请基于上面的片段回答用户的问题。回复时请引用具体片段编号。`;

    // 步骤 3: 调用 OpenAI 流式 API
    const llmResponse = await llmClient.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: RAG_SYSTEM_PROMPT },
        ...history.map((h: { role: string; content: string }) => ({
          role: h.role as "user" | "assistant",
          content: h.content,
        })),
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      stream: true,
    });

    // 步骤 4: 创建 SSE 流式响应
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          // 先发送来源引用
          const sourcesEvent = `data: ${JSON.stringify({
            type: "sources",
            sources,
          })}\n\n`;
          controller.enqueue(encoder.encode(sourcesEvent));

          // 流式发送文本块
          for await (const chunk of llmResponse) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              const event = `data: ${JSON.stringify({
                type: "chunk",
                content,
              })}\n\n`;
              controller.enqueue(encoder.encode(event));
            }
          }

          // 发送完成信号
          const doneEvent = `data: ${JSON.stringify({
            type: "done",
          })}\n\n`;
          controller.enqueue(encoder.encode(doneEvent));
          controller.close();
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "流式生成失败";
          const errorEvent = `data: ${JSON.stringify({
            type: "error",
            message,
          })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // 禁用 Nginx 缓冲
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error(`[POST /api/chat] 异常: ${message}`);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ============================================================
// SSE 辅助工具（用于非流式场景的错误/空结果响应）
// ============================================================

interface SSEStream {
  send: (type: string, data: Record<string, unknown>) => void;
  close: () => Response;
}

function createSSEStream(): SSEStream {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      // 内部引用，在 send 中使用
      (stream as any)._controller = controller;
    },
  });

  return {
    send(type: string, data: Record<string, unknown>) {
      if (closed) return;
      const event = `data: ${JSON.stringify({ type, ...data })}\n\n`;
      ((stream as any)._controller as ReadableStreamDefaultController)?.enqueue(
        encoder.encode(event)
      );
    },
    close() {
      if (closed) return new Response("Already closed");
      closed = true;
      ((stream as any)._controller as ReadableStreamDefaultController)?.close();
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    },
  };
}
