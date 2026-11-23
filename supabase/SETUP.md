# Supabase 设置与验收

本指南用于**全新 Supabase 项目**。示例模型为硅基流动 `BAAI/bge-m3`，输出 1024 维。
已有数据库包含论文向量时，不要重新执行初始化 SQL 或直接改向量维度；先备份并重新索引。

## 1. 创建项目与获取密钥

在 Supabase 创建项目，从 Project Settings → API 获取项目 URL、anon key 和 service_role key。
`service_role` 仅用于服务端，不能放进前端代码或提交到 Git。

## 2. 初始化数据库

在 SQL Editor 中依次执行 `supabase/migrations/001_init.sql` 和
`supabase/migrations/002_auth_and_index_jobs.sql` 的全部内容。
前者创建表、向量索引和 RLS；后者收紧写入权限并创建持久任务和事务函数。
向量列和搜索函数均使用 `VECTOR(1024)`，与示例模型一致。

如果要使用 OpenAI `text-embedding-3-small`，必须在**空库初始化前**把 SQL 中两处
`VECTOR(1024)` 改为 `VECTOR(1536)`，并在本地配置 `EMBEDDING_DIMENSIONS=1536`。

## 3. 创建私有存储桶

在 Storage 创建名为 `papers` 的 bucket，保持私有。初始化 SQL 底部的 Storage
策略示例不需要手动执行。002 已按论文归属配置认证用户的文件读取策略，写操作由服务端处理。

## 4. 配置并启动

```bash
cp .env.local.example .env.local
# 编辑 .env.local，填入真实的 Supabase 与硅基流动密钥
npm ci
npm run dev
```

另开终端执行 `npm run worker`，保持它运行。仅启动 Web 服务不能保证自动重试和中断恢复。
`npm run worker -- --once` 只处理一项待办，用于检查配置，不适合作为常驻服务。

仅在 `.env.local` 填写真正密钥；该文件已被 Git 忽略。URL 直接写 `https://`，不要加反斜杠。
当前示例模型是 `Qwen/Qwen2.5-7B-Instruct` 与 `BAAI/bge-m3`。

## 5. 验收

先运行 `npm run lint`、`npm run type-check`、`npm test` 和 `npm run build`。
在 `/login` 注册账号，若项目要求邮件确认，先确认邮箱再使用密码登录。
然后用文字型 PDF 验证：

1. 上传后出现论文记录，状态从 `processing` 变为 `ready`。
2. 提问后收到包含引用的回答，输入框恢复可用。
3. 对无法提取文本的 PDF，应出现 `error` 状态及可读的错误信息。
4. 用另一个账号打开第一账号的论文 ID，应返回 404；列表、删除、问答和重试均不应越权。
5. 停止 worker 后上传文件，再关闭 Web 进程。重启 worker 后等待租约过期，应重新领取任务。
6. 在详情页查看处理步骤；失败任务点击“重新处理”，确认没有重复文本块。

可在 SQL Editor 核对数据库向量列：

```sql
SELECT format_type(atttypid, atttypmod) AS embedding_type
FROM pg_attribute
WHERE attrelid = 'public.document_chunks'::regclass AND attname = 'embedding';
```

预期为 `vector(1024)`。

## 6. 已有数据库升级

已有数据库仅执行 002，不重复执行 001。它不更改向量维度，不删除论文或文本块。
可在本机 `.env.local` 配置 `DATABASE_URL`，然后运行 `npm run db:migrate`；
脚本只执行 002 并记录校验和，使用 TLS 证书校验，不打印密码。
默认 CA 是仓库内的 Supabase 官方公开根证书；其他 CA 可由 DATABASE_SSL_CA_FILE 指定。
连接串在 Supabase 顶部 Connect → Connection String → Method: Session pooler 中复制。

旧演示论文的 `user_id` 可能为空或为虚拟 UUID，升级后会对普通用户隐藏，而非自动归属首个注册者。
在 Dashboard 的 Authentication → Users 核对真实账号 UUID 后，管理员可按明确论文 ID 手动分配：

```sql
-- 替换为确认过的账号与论文 UUID；不要无条件更新全部论文。
UPDATE public.documents SET user_id = '真实账号 UUID'
WHERE id IN ('确认属于此账号的论文 UUID');
```

旧的 Storage 路径会保留；读取策略按 documents.storage_path 和 user_id 判断归属。
旧失败论文在分配后可以点击重新处理，届时会创建新任务。旧 ready 论文的向量模型迁移另行处理。

## 7. 运行与部署

- Web：`npm run build` 后 `npm start`。
- Worker：在同一代码版本与环境变量下运行 `npm run worker`，使用进程管理器自动重启。
- 环境：Node.js 22；worker 需要 tsx/TypeScript，因此安装时保留开发依赖。
- Supabase：启用 Email Auth；如使用邮件确认，将 Site URL 配置为实际应用 URL。
- 不将 service_role、数据库连接串或模型密钥放到 NEXT_PUBLIC_* 变量中。

API 权限、租约、原子发布与面试说明见 `docs/security-and-indexing.md`。
