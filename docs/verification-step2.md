# 第二步验收记录（2026-11-23）

## 自动检查

- 在不含 .env.local 的独立目录中，用锁文件执行 npm ci。
- npm run lint、npm run type-check、npm test、npm run build 均通过。
- npm test 当前有 17 个通过项，包含 API、真实 PostgreSQL/pgvector 迁移、任务事务与 PDF 解析。
- 构建使用无权限占位变量，不依赖本机真实密钥；Next.js 识别 Node.js 页面中间件。
- 启动生产构建后实际检查：/papers、/upload、/chat 跳转 /login，匿名 /api/papers 返回 401，/login 返回 200。

## 实际 Supabase 验收

已通过本机 PostgreSQL 连接执行 002。连接使用 TLS 并校验证书，没有使用 rejectUnauthorized=false。
迁移前后原有 5 篇论文和 385 个文本块的数量与逐表内容摘要一致。

运行 scripts/verify-security.ts，创建两个临时账号（不发送邮件）和合成 PDF：

1. 账号 A 上传、完成索引、检索到原文并返回 sources/chunk/done 流事件。
2. 账号 B 无法通过详情、删除、问答、重试 API 访问 A 的论文。
3. 账号 B 通过用户会话直接查询文本块或下载私有 PDF 同样被拒绝。
4. 在仅属于测试账号的任务上模拟过期租约，worker 接手后进入 ready；文本块数量未增加。
5. 旧租约调用发布函数返回 false，不能覆盖新结果。
6. 账号 A 对模拟失败任务发起手动重试，返回 202，随后恢复 ready。
7. 结束后清理所有临时账号、论文、任务和文件，再次核对旧数据摘要一致。

独立 worker 的 npm run worker -- --once 也已在实际项目上启动验证通过。

## 复验

本地启动 npm run dev -- -p 3001，再执行 npx tsx scripts/verify-security.ts。
该脚本只允许访问 localhost/127.0.0.1；会使用当前 .env.local 指向的 Supabase，
创建并清理临时测试账号和合成论文。请在了解此行为后手动运行，不在 CI 中自动调用。

此记录不代表完成压力测试或公网生产部署。自动化数据库测试使用隔离的 PGlite，
云端验收使用当前项目配置；旧论文归属不会自动分配给新账号。
