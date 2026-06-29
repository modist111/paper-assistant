-- ============================================================
-- AI 论文阅读助手 — 数据库初始化迁移
-- ============================================================
-- 在 Supabase SQL Editor 中执行此文件
-- 或使用 Supabase CLI: supabase migration up
-- ============================================================

-- 1. 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ============================================================
-- 2. 创建表
-- ============================================================

-- 2.1 论文文档表
CREATE TABLE IF NOT EXISTS documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title         TEXT NOT NULL,
  filename      TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  page_count    INTEGER,
  file_size     BIGINT,
  status        TEXT NOT NULL DEFAULT 'processing'
                CHECK (status IN ('processing', 'ready', 'error')),
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.2 文档文本块 + 向量嵌入表
CREATE TABLE IF NOT EXISTS document_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,
  content       TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  embedding     VECTOR(1536),  -- text-embedding-3-small 维度
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.3 聊天会话表
CREATE TABLE IF NOT EXISTS chat_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.4 聊天消息表
CREATE TABLE IF NOT EXISTS chat_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT NOT NULL,
  sources       JSONB NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. 索引
-- ============================================================

-- 3.1 向量相似度索引 (IVFFlat)
-- 注意：IVFFlat 索引需要在表中插入足够数据后创建效果更好
-- 如果表为空，可以先插入一些初始数据再创建
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
  ON document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 3.2 常规 B-tree 索引
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id
  ON document_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_documents_user_id
  ON documents(user_id);

CREATE INDEX IF NOT EXISTS idx_documents_status
  ON documents(status);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_document_id
  ON chat_sessions(document_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id
  ON chat_messages(session_id);

-- ============================================================
-- 4. 函数 & 触发器
-- ============================================================

-- 4.1 自动更新 updated_at 函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4.2 documents 表 updated_at 触发器
DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 5. 向量相似度搜索函数
-- ============================================================

-- 按余弦相似度搜索最相似的 chunks
CREATE OR REPLACE FUNCTION search_document_chunks(
  query_embedding VECTOR(1536),
  match_document_id UUID DEFAULT NULL,
  match_count INTEGER DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  chunk_index INTEGER,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE
    (match_document_id IS NULL OR dc.document_id = match_document_id)
    AND 1 - (dc.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================
-- 6. Row Level Security (RLS) 策略
-- ============================================================

-- 6.1 启用 RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- 6.2 documents 策略
-- 用户只能查看自己的文档
CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT
  USING (auth.uid() = user_id);

-- 用户可以创建文档
CREATE POLICY "Users can insert own documents"
  ON documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 用户可以更新自己的文档
CREATE POLICY "Users can update own documents"
  ON documents FOR UPDATE
  USING (auth.uid() = user_id);

-- 用户可以删除自己的文档
CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE
  USING (auth.uid() = user_id);

-- 6.3 document_chunks 策略
-- 用户可以通过关联的 document 查看 chunks
CREATE POLICY "Users can view chunks of own documents"
  ON document_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chunks.document_id
      AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert chunks of own documents"
  ON document_chunks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chunks.document_id
      AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete chunks of own documents"
  ON document_chunks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chunks.document_id
      AND documents.user_id = auth.uid()
    )
  );

-- 6.4 chat_sessions 策略
CREATE POLICY "Users can manage own chat sessions"
  ON chat_sessions FOR ALL
  USING (auth.uid() = user_id);

-- 6.5 chat_messages 策略
CREATE POLICY "Users can manage messages in own sessions"
  ON chat_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.id = chat_messages.session_id
      AND chat_sessions.user_id = auth.uid()
    )
  );

-- ============================================================
-- 7. Storage 配置
-- ============================================================
-- 注意：此部分需要在 Supabase Dashboard → Storage 中手动配置
-- 或使用 Supabase Management API

-- 你需要：
-- 1. 创建名为 "papers" 的 Storage Bucket
-- 2. 设置 Bucket 为私有 (public = false)
-- 3. 添加以下 Storage RLS 策略：

/*
-- Storage Bucket 策略 (在 Supabase Dashboard SQL Editor 中执行)

-- 允许认证用户上传 PDF
CREATE POLICY "Allow authenticated uploads"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'papers'
    AND (storage.extension(name) = 'pdf')
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 允许用户查看自己上传的文件
CREATE POLICY "Allow users to view own files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'papers'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 允许用户删除自己的文件
CREATE POLICY "Allow users to delete own files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'papers'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
*/
