import { parsePdfBuffer } from "./parse";
import { chunkText } from "./chunk";
import { embedTexts, EMBEDDING_MODEL } from "@/lib/ai/embed";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface IndexPipelineOptions {
  documentId: string;
  leaseToken: string;
  pdfBuffer: Buffer;
  fallbackTitle?: string;
  signal?: AbortSignal;
  chunkSize?: number;
  chunkOverlap?: number;
}

/** Build in memory, then publish chunks and ready status in a single fenced transaction. */
export async function runIndexPipeline(options: IndexPipelineOptions) {
  const { documentId, leaseToken, pdfBuffer, signal } = options;
  async function progress(step: string, completed = 0, total = 0) {
    signal?.throwIfAborted();
    const { data, error } = await supabaseAdmin.rpc("heartbeat_document_index_job", {
      p_document_id: documentId, p_lease_token: leaseToken,
      p_step: step, p_completed: completed, p_total: total,
    });
    if (error) throw new Error("写入索引进度失败: " + error.message);
    if (!data) throw new Error("索引任务锁已过期，旧任务停止发布");
  }

  await progress("parsing");
  const parsed = await parsePdfBuffer(pdfBuffer);
  const title = parsed.info.title || options.fallbackTitle || "未知标题";
  await progress("chunking");
  const chunks = await chunkText(parsed.text, {
    chunkSize: options.chunkSize ?? 1000,
    chunkOverlap: options.chunkOverlap ?? 200,
  });
  if (!chunks.length) throw new Error("未能从 PDF 中提取文本");
  const rows = [];
  const batchSize = 10;
  for (let offset = 0; offset < chunks.length; offset += batchSize) {
    await progress("embedding", offset, chunks.length);
    const batch = chunks.slice(offset, offset + batchSize);
    const embeddings = await embedTexts(batch.map((chunk) => chunk.content));
    signal?.throwIfAborted();
    rows.push(...batch.map((chunk, index) => ({
      chunk_index: chunk.index,
      content: chunk.content.replace(/\x00/g, ""),
      content_hash: chunk.contentHash,
      embedding: embeddings[index],
      metadata: {
        start_char: chunk.metadata.startChar, end_char: chunk.metadata.endChar,
        embedding_model: EMBEDDING_MODEL,
      },
    })));
  }
  await progress("publishing", chunks.length, chunks.length);
  const { data, error } = await supabaseAdmin.rpc("finish_document_index_job", {
    p_document_id: documentId, p_lease_token: leaseToken,
    p_chunks: rows, p_title: title, p_page_count: parsed.pageCount,
  });
  if (error) throw new Error("发布索引失败: " + error.message);
  if (!data) throw new Error("索引任务已失效，未覆盖新任务结果");
  return { success: true, chunkCount: rows.length, title, pageCount: parsed.pageCount };
}

export { parsePdfBuffer, chunkText };
