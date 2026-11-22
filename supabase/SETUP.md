# Supabase 设置与验收

本指南用于**全新 Supabase 项目**。示例模型为硅基流动 `BAAI/bge-m3`，输出 1024 维。
已有数据库包含论文向量时，不要重新执行初始化 SQL 或直接改向量维度；先备份并重新索引。

## 1. 创建项目与获取密钥

在 Supabase 创建项目，从 Project Settings → API 获取项目 URL、anon key 和 service_role key。
`service_role` 仅用于服务端，不能放进前端代码或提交到 Git。

## 2. 初始化数据库

在 SQL Editor 中一次性执行 `supabase/migrations/001_init.sql` 的全部内容。
它会启用 pgvector、创建表、索引、搜索函数及 RLS 策略。
向量列和搜索函数均使用 `VECTOR(1024)`，与示例模型一致。

如果要使用 OpenAI `text-embedding-3-small`，必须在**空库初始化前**把 SQL 中两处
`VECTOR(1024)` 改为 `VECTOR(1536)`，并在本地配置 `EMBEDDING_DIMENSIONS=1536`。

## 3. 创建私有存储桶

在 Storage 创建名为 `papers` 的 bucket，保持私有。初始化 SQL 底部的 Storage
策略示例供未来接入 Supabase Auth 时参考；当前演示 API 用 Service Role。

## 4. 配置并启动

```bash
cp .env.local.example .env.local
# 编辑 .env.local，填入真实的 Supabase 与硅基流动密钥
npm ci
npm run dev
```

仅在 `.env.local` 填写真正密钥；该文件已被 Git 忽略。URL 直接写 `https://`，不要加反斜杠。
当前示例模型是 `Qwen/Qwen2.5-7B-Instruct` 与 `BAAI/bge-m3`。

## 5. 验收

先运行 `npm run lint`、`npm run type-check` 和 `npm run build`。然后用文字型 PDF 验证：

1. 上传后出现论文记录，状态从 `processing` 变为 `ready`。
2. 提问后收到包含引用的回答，输入框恢复可用。
3. 对无法提取文本的 PDF，应出现 `error` 状态及可读的错误信息。

可在 SQL Editor 核对数据库向量列：

```sql
SELECT format_type(atttypid, atttypmod) AS embedding_type
FROM pg_attribute
WHERE attrelid = 'public.document_chunks'::regclass AND attname = 'embedding';
```

预期为 `vector(1024)`。新建演示文档的 `user_id` 为 NULL，不需要虚构 `auth.users` 记录。

当前版本没有登录和请求级权限检查，不能作为多人公开服务部署。
