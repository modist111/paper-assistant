import { embedText } from "./embed";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { RetrievalResult } from "@/types";

/**
 * 检索选项
 */
export interface RetrieveOptions {
  /** 要搜索的论文 ID */
  documentId?: string;
  /** 返回结果数量 */
  limit?: number;
  /** 相似度阈值（0-1），低于此值的结果被过滤 */
  similarityThreshold?: number;
}

/**
 * 使用向量相似度检索最相关的论文片段
 *
 * 流程：
 * 1. 将查询文本向量化
 * 2. 调用 pgvector RPC 函数 search_document_chunks
 * 3. 返回带相似度评分的匹配结果
 *
 * @param query - 用户查询文本
 * @param options - 检索选项
 * @returns 最相关的结果列表（按相似度降序）
 */
export async function retrieveRelevantChunks(
  query: string,
  options: RetrieveOptions = {}
): Promise<RetrievalResult[]> {
  const {
    documentId,
    limit = 5,
    similarityThreshold = 0.7,
  } = options;

  // 步骤 1: 向量化查询
  const queryEmbedding = await embedText(query);

  // 步骤 2: 调用 pgvector RPC 函数
  const { data, error } = await supabaseAdmin.rpc("search_document_chunks", {
    query_embedding: queryEmbedding,
    match_document_id: documentId || null,
    match_count: limit,
    similarity_threshold: similarityThreshold,
  });

  if (error) {
    console.error(`[Retrieve] 向量搜索失败: ${error.message}`);
    throw new Error(`向量搜索失败: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // 步骤 3: 映射结果
  return (data as Array<{
    id: string;
    document_id: string;
    chunk_index: number;
    content: string;
    metadata: Record<string, unknown>;
    similarity: number;
  }>).map((row) => ({
    chunk: {
      id: row.id,
      document_id: row.document_id,
      chunk_index: row.chunk_index,
      content: row.content,
      content_hash: "",
      metadata: row.metadata as any,
      created_at: "",
    },
    similarity: row.similarity,
  }));
}
