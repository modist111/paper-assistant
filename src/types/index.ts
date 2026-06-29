// ============================================================
// 共享 TypeScript 类型定义
// ============================================================

/** 论文处理状态 */
export type PaperStatus = "processing" | "ready" | "error";

/** 论文文档 */
export interface Paper {
  id: string;
  user_id?: string;
  title: string;
  filename: string;
  storage_path: string;
  page_count: number | null;
  file_size: number | null;
  status: PaperStatus;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

/** 文档文本块（含向量嵌入） */
export interface DocumentChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  content_hash: string;
  embedding?: number[];
  metadata: ChunkMetadata;
  created_at: string;
}

/** 文本块元信息 */
export interface ChunkMetadata {
  page?: number;
  section?: string;
  start_char?: number;
  end_char?: number;
}

/** RAG 检索结果 */
export interface RetrievalResult {
  chunk: DocumentChunk;
  similarity: number;
}

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceReference[];
  created_at?: string;
}

/** 来源引用 */
export interface SourceReference {
  chunk_index: number;
  content: string;
  page?: number;
  similarity: number;
}

/** 上传响应 */
export interface UploadResponse {
  success: boolean;
  paperId?: string;
  error?: string;
}

/** 聊天请求 */
export interface ChatRequest {
  paperId: string;
  question: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

/** API 错误响应 */
export interface ApiError {
  error: string;
  details?: string;
}
