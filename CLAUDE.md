# CLAUDE.md — AI 论文阅读助手 (Research Paper Assistant)

## 项目概述

AI 论文阅读助手是一个基于 Next.js 15 的 Web 应用，允许用户上传学术 PDF 论文，通过 RAG（检索增强生成）技术实现针对论文内容的智能问答。

**核心用户旅程：**
上传 PDF → 自动文本提取/分块/向量化 → 在聊天界面提问 → 获得带来源引用的 AI 答案

## 技术栈

| 层 | 技术 | 用途 |
|---|---|---|
| 框架 | Next.js 15 (App Router) | React Server Components, Server Actions, API Routes |
| 语言 | TypeScript (strict mode) | 全栈类型安全 |
| 样式 | Tailwind CSS 3.4 + shadcn/ui | 设计系统 & UI 组件 |
| 数据库 | Supabase (PostgreSQL + pgvector) | 结构化数据 + 向量存储 |
| 文件存储 | Supabase Storage | PDF 文件存储 |
| AI SDK | Vercel AI SDK v4 + @ai-sdk/openai | 流式 LLM 响应 |
| Embedding | OpenAI text-embedding-3-small (1536d) | 文本向量化 |
| LLM | OpenAI gpt-4o | RAG 问答生成 |
| PDF 解析 | pdf-parse | 纯 JS PDF 文本提取 |
| 文本分块 | @langchain/textsplitters | RecursiveCharacterTextSplitter |

## 架构图

```
┌──────────────────────────────────────────────────────────┐
│                      客户端 (Browser)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐    │
│  │ 论文管理  │  │ PDF 上传  │  │   聊天界面 (流式)     │    │
│  │ PaperList │  │ Uploader │  │ ChatInterface        │    │
│  └────┬──────┘  └────┬─────┘  └──────────┬───────────┘    │
│       │              │                   │                │
│       │     ┌────────┴────────┐          │                │
│       │     │  react-dropzone │          │                │
│       │     └────────┬────────┘          │                │
└───────┼──────────────┼───────────────────┼────────────────┘
        │              │                   │
        ▼              ▼                   ▼
┌──────────────────────────────────────────────────────────┐
│                  Next.js 服务端 (API Routes)               │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐    │
│  │/api/papers│  │/api/upload│  │   /api/chat          │   │
│  │ CRUD      │  │ 上传+索引 │  │   RAG 问答 (stream)   │   │
│  └────┬──────┘  └────┬─────┘  └──────────┬───────────┘    │
│       │              │                   │                │
│  ┌────┴──────────────┴───────────────────┴───────────┐    │
│  │                   Lib 层                            │   │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────┐     │   │
│  │  │ supabase │  │   pdf/   │  │     ai/       │     │   │
│  │  │ clients  │  │ parse.ts │  │ embed.ts      │     │   │
│  │  │          │  │ chunk.ts │  │ retrieve.ts   │     │   │
│  │  │          │  │ index.ts │  │ generate.ts   │     │   │
│  │  └────┬─────┘  └────┬─────┘  └───────┬───────┘     │   │
│  └───────┼─────────────┼─────────────────┼─────────────┘   │
└──────────┼─────────────┼─────────────────┼─────────────────┘
           │             │                 │
           ▼             ▼                 ▼
┌──────────────────┐  ┌──────────────────────────────┐
│  Supabase        │  │    OpenAI API                 │
│  ┌──────────┐    │  │  • embeddings (3-small)       │
│  │PostgreSQL│    │  │  • chat completions (gpt-4o)  │
│  │+ pgvector│    │  └──────────────────────────────┘
│  └──────────┘    │
│  ┌──────────┐    │
│  │ Storage  │    │
│  │ (PDFs)   │    │
│  └──────────┘    │
└──────────────────┘
```

## RAG 流水线数据流

```
PDF 上传阶段：
  PDF 文件
    ├─→ Supabase Storage (原始文件存储)
    └─→ pdf-parse (文本提取)
         └─→ RecursiveCharacterTextSplitter (chunk_size=1000, overlap=200)
              └─→ text-embedding-3-small (向量化)
                   └─→ document_chunks 表 (content + embedding + metadata)

问答阶段：
  用户问题
    └─→ text-embedding-3-small (问题向量化)
         └─→ document_chunks 表 (pgvector cosine 相似度, topK=5)
              └─→ 拼接为上下文
                   └─→ gpt-4o (RAG prompt)
                        └─→ 流式返回答案 + 来源引用
```

## 项目结构

```
paper-assistant/
├── src/
│   ├── app/                    # Next.js App Router（文件即路由）
│   │   ├── layout.tsx          # 根布局
│   │   ├── page.tsx            # 首页 (仪表盘)
│   │   ├── globals.css         # Tailwind + CSS 变量
│   │   ├── upload/page.tsx     # /upload - 上传页面
│   │   ├── papers/[id]/page.tsx  # /papers/[id] - 论文详情
│   │   ├── chat/[paperId]/page.tsx  # /chat/[paperId] - 聊天问答
│   │   └── api/
│   │       ├── papers/         # 论文 CRUD
│   │       ├── upload/         # PDF 上传 + 索引
│   │       └── chat/           # RAG 问答 (流式)
│   ├── components/
│   │   ├── ui/                 # shadcn/ui 基础组件
│   │   ├── pdf/                # PDF 上传/预览组件
│   │   ├── chat/               # 聊天界面组件
│   │   ├── paper/              # 论文卡片/列表组件
│   │   └── layout/             # 导航/侧边栏组件
│   ├── lib/
│   │   ├── supabase/           # Supabase 客户端 (browser/server/admin)
│   │   ├── ai/                 # RAG 流水线 (embed, retrieve, generate)
│   │   ├── pdf/                # PDF 处理 (parse, chunk, index)
│   │   └── utils.ts           # 通用工具 (cn, formatFileSize 等)
│   ├── hooks/                  # 自定义 React hooks
│   └── types/                  # 共享 TypeScript 类型
├── supabase/
│   └── migrations/             # 数据库迁移文件
└── 配置文件 (package.json, tsconfig.json, tailwind.config.ts, etc.)
```

## 开发规范

### 代码风格
- **TypeScript strict**: 所有函数参数和返回值必须有明确类型
- **组件名大驼峰**: `PaperCard.tsx`, `ChatInterface.tsx`
- **文件名小写短横线**: `use-chat.ts`, `pdf-upload.ts`
- **导出**: 优先使用命名导出（named export），页面组件可用默认导出
- **注释**: 使用 JSDoc 格式注释公共 API（`/** ... */`）

### 组件规范
- 客户端组件使用 `"use client"` 指令（仅在需要交互/状态时）
- 尽量保持组件为 Server Component（Next.js App Router 默认）
- 每个组件文件只导出一个主要组件
- 组件 props 使用 interface 定义，放置在文件顶部

### API Route 规范
- 使用 Next.js Route Handlers（`route.ts`）
- 统一错误处理：try-catch + 返回 `{ error: string }` 格式
- 流式响应使用 Vercel AI SDK 的 `streamText()`
- 所有 POST 请求用 zod 验证请求体

### 数据库规范
- 所有表使用 UUID 主键
- 使用 RLS（Row Level Security）策略保护数据
- document_chunks 使用 ON DELETE CASCADE 关联 documents
- pgvector 使用 IVFFlat 索引，cosine 距离

### 安全规范
- 文件上传限制：PDF only，最大 20MB
- Supabase Storage Bucket 设为非公开
- 所有用户数据通过 RLS 隔离
- API 路由验证请求来源

## Prompt 工程原则

### RAG System Prompt
- **角色设定**: "你是一个学术论文分析助手。你的回答必须严格基于提供的论文片段。"
- **引述要求**: "回答时引用具体的片段编号，不要编造论文中不存在的信息。"
- **不确定处理**: "如果论文片段中没有相关信息，明确说明'根据提供的论文片段，无法回答此问题'。"
- **语言设置**: 使用中文回答，专业术语保留英文原文并加括号标注中文。

### Embedding 策略
- 文档分块: chunk_size=1000, chunk_overlap=200（保留语义连贯性）
- 检索 topK=5（平衡上下文长度和相关性）
- 相似度阈值: 0.7（低于此值不纳入上下文）

## 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 类型检查
pnpm type-check

# 代码质量
pnpm lint
```

## 环境变量

参见 `.env.local.example`。必需变量：
- `OPENAI_API_KEY` — OpenAI API 密钥
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase 项目 URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase 匿名密钥
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase Service Role 密钥（仅服务端）
