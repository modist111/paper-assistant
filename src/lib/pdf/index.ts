import { parsePdfBuffer } from "./parse";
import { chunkText, type TextChunk } from "./chunk";
import { embedTexts } from "@/lib/ai/embed";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PaperStatus } from "@/types";

/**
 * 完整索引流水线选项
 */
export interface IndexPipelineOptions {
  /** 文档记录 ID（必须已存在） */
  documentId: string;
  /** PDF 文件的原始 Buffer */
  pdfBuffer: Buffer;
  /** 分块大小 */
  chunkSize?: number;
  /** 分块重叠大小 */
  chunkOverlap?: number;
}

/**
 * 索引流水线结果
 */
export interface IndexPipelineResult {
  success: boolean;
  chunkCount: number;
  title: string;
  pageCount: number;
  error?: string;
}

/**
 * 完整的 PDF 索引流水线
 *
 * 此函数编排以下步骤：
 * 1. 解析 PDF → 提取文本
 * 2. 文本分块
 * 3. 批量向量化（每批 20 个，避免 API 限流）
 * 4. 存入 document_chunks 表
 * 5. 更新 documents.status = 'ready'
 *
 * @param options - 流水线配置
 * @returns 索引结果
 */
export async function runIndexPipeline(
  options: IndexPipelineOptions
): Promise<IndexPipelineResult> {
  const { documentId, pdfBuffer, chunkSize, chunkOverlap } = options;

  try {
    // 步骤 1: 解析 PDF
    console.log("[IndexPipeline] 步骤1: 开始解析 PDF...");
    const parsed = await parsePdfBuffer(pdfBuffer);
    const title = parsed.info.title || "未知标题";
    console.log(`[IndexPipeline] 步骤1: PDF 解析完成 — ${parsed.pageCount} 页, ${parsed.text.length} 字符`);

    // 步骤 2: 文本分块
    console.log("[IndexPipeline] 步骤2: 开始文本分块...");
    const chunks = await chunkText(parsed.text, {
      chunkSize: chunkSize ?? 1000,
      chunkOverlap: chunkOverlap ?? 200,
    });
    console.log(`[IndexPipeline] 步骤2: 分块完成 — ${chunks.length} 个块`);

    if (chunks.length === 0) {
      await updateStatus(documentId, "error", "未能从 PDF 中提取文本");
      return {
        success: false,
        chunkCount: 0,
        title,
        pageCount: parsed.pageCount,
        error: "未能从 PDF 中提取文本",
      };
    }

    // 步骤 3 & 4: 分批向量化并存入数据库
    const BATCH_SIZE = 10; // 每批 10 个 chunk（硅基流动限速较严）
    let insertedCount = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map((c) => c.content);

      // 3. 向量化
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      console.log(`[IndexPipeline] 步骤3: 向量化批次 ${batchNum} (${texts.length} 个文本)...`);
      const embeddings = await embedTexts(texts);
      console.log(`[IndexPipeline] 步骤3: 向量化完成 — ${embeddings.length} 个向量`);

      // 批次间延迟 500ms，避免 API 限速
      if (i + BATCH_SIZE < chunks.length) {
        await new Promise((r) => setTimeout(r, 500));
      }

      // 4. 写入数据库
      const rows = batch.map((chunk, idx) => ({
        document_id: documentId,
        chunk_index: chunk.index,
        content: sanitizeContent(chunk.content),
        content_hash: chunk.contentHash,
        embedding: embeddings[idx],
        metadata: {
          start_char: chunk.metadata.startChar,
          end_char: chunk.metadata.endChar,
        },
      }));

      const { error: insertError } = await supabaseAdmin
        .from("document_chunks")
        .insert(rows);

      if (insertError) {
        throw new Error(`数据库写入失败: ${insertError.message}`);
      }

      insertedCount += batch.length;
    }

    // 步骤 5: 更新文档状态
    await supabaseAdmin
      .from("documents")
      .update({
        status: "ready" as PaperStatus,
        title,
        page_count: parsed.pageCount,
      })
      .eq("id", documentId);

    return {
      success: true,
      chunkCount: insertedCount,
      title,
      pageCount: parsed.pageCount,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "未知错误";
    console.error(`[IndexPipeline] 索引失败: ${message}`);
    // 打印完整错误详情
    if (error instanceof Error && "status" in error) {
      console.error(`[IndexPipeline] HTTP 状态: ${(error as any).status}`);
      console.error(`[IndexPipeline] 响应体:`, (error as any).body || "(空)");
    }
    if (error instanceof Error && error.stack) {
      console.error(`[IndexPipeline] 堆栈: ${error.stack}`);
    }
    await updateStatus(documentId, "error", message);
    return {
      success: false,
      chunkCount: 0,
      title: "",
      pageCount: 0,
      error: message,
    };
  }
}

/**
 * 更新文档状态
 */
async function updateStatus(
  documentId: string,
  status: PaperStatus,
  errorMessage?: string
) {
  await supabaseAdmin
    .from("documents")
    .update({
      status,
      error_message: errorMessage || null,
    })
    .eq("id", documentId);
}

export { parsePdfBuffer, chunkText };

/** 清理文本中的非法 Unicode 转义序列 */
function sanitizeContent(text: string): string {
  return text
    .replace(/\\u[0-9a-fA-F]{4}/g, " ")  // 移除 \uXXXX 序列
    .replace(/\\/g, "\\\\")               // 转义反斜杠
    .replace(/\x00/g, "");                // 移除 null 字符
}
