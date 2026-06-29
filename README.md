# AI 论文阅读助手 (Research Paper Assistant)

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8?logo=tailwind-css)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%2Bpgvector-3ecf8e?logo=supabase)](https://supabase.com/)
[![OpenAI](https://img.shields.io/badge/OpenAI-gpt--4o%2Bembedding-412991?logo=openai)](https://openai.com/)

一个基于 **RAG（检索增强生成）** 的学术论文智能问答 Web 应用。上传 PDF 论文后，AI 自动解析、分块、向量化，然后你可以用自然语言对论文内容进行提问，获得精确带来源引用的回答。

## 功能演示

```
┌─────────────────────────────────────────────────────────┐
│  📄 上传 PDF 论文                                       │
│  ↓                                                      │
│  🔍 自动文本提取 → 智能分块 → 向量索引 (1536d)           │
│  ↓                                                      │
│  💬 自然语言问答                                        │
│  "这篇论文的核心贡献是什么？"                             │
│  "论文使用了什么方法？有什么局限性？"                     │
│  ↓                                                      │
│  🤖 AI 回答 + 📎 来源引用（带置信度评分）                │
│  "根据论文片段1和片段3，该论文的主要贡献是..."            │
└─────────────────────────────────────────────────────────┘
```

### 核心特性

- **📄 PDF 解析** — 自动提取文本，支持学术论文（文字型 PDF）
- **🧠 语义分块** — RecursiveCharacterTextSplitter 智能分块，保留段落和句子完整性
- **🔢 向量检索** — OpenAI text-embedding-3-small + pgvector，高精度语义搜索
- **💬 流式问答** — gpt-4o RAG 生成，SSE 流式响应，逐字显示
- **📎 来源追溯** — 每个回答都附带引用片段、相似度评分、页码范围
- **🔄 多轮对话** — 支持对话历史上下文，可追问、深入探讨
- **🎨 现代 UI** — Tailwind CSS + shadcn/ui，支持亮色/暗色主题

## 技术架构

```
┌─────────────────────────────────────────────────┐
│                    Browser                       │
│   PaperList │ PdfUploader │ ChatInterface (SSE)  │
└──────────────────────┬──────────────────────────┘
                       │ HTTP / SSE
┌──────────────────────▼──────────────────────────┐
│               Next.js 15 Server                  │
│   /api/upload  │  /api/papers  │  /api/chat     │
│        │              │              │           │
│   ┌────┴──────────────┴──────────────┴────┐      │
│   │           Lib Layer                    │      │
│   │  parse → chunk → embed → retrieve →   │      │
│   │  generate (RAG Pipeline)              │      │
│   └────────────────┬──────────────────────┘      │
└────────────────────┼─────────────────────────────┘
                     │
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
┌─────────┐  ┌──────────────┐  ┌──────────┐
│ Supabase│  │  Supabase    │  │  OpenAI  │
│PostgreSQL│  │  Storage     │  │  API     │
│+pgvector│  │  (PDFs)      │  │          │
└─────────┘  └──────────────┘  └──────────┘
```

### 技术栈

| 层 | 技术 | 用途 |
|---|---|---|
| 框架 | Next.js 15 (App Router) | React Server Components, Server Actions, API Routes |
| 语言 | TypeScript (strict) | 全栈类型安全 |
| 样式 | Tailwind CSS 3.4 + shadcn/ui | 设计系统 & UI 组件 |
| 数据库 | Supabase (PostgreSQL + pgvector) | 结构化数据 + 向量存储 + 全文搜索 |
| 文件存储 | Supabase Storage | PDF 文件安全存储 |
| AI SDK | OpenAI SDK + Vercel AI SDK | 流式 LLM 响应 |
| Embedding | OpenAI text-embedding-3-small (1536d) | 文本向量化 |
| LLM | OpenAI gpt-4o | RAG 问答生成 |
| PDF 解析 | pdf-parse | 纯 JS PDF 文本提取 |
| 分块 | @langchain/textsplitters | RecursiveCharacterTextSplitter |

### RAG 流水线

```
📥 索引阶段（上传时执行一次）：
  PDF → pdf-parse 提取文本
      → RecursiveCharacterTextSplitter (chunk_size=1000, overlap=200)
      → text-embedding-3-small 向量化 (1536d)
      → pgvector 存储 (IVFFlat 索引)

💬 问答阶段（每次提问执行）：
  用户问题 → text-embedding-3-small 向量化
           → pgvector cosine 相似度搜索 (topK=5, threshold=0.7)
           → 拼接上下文 + 构建 RAG System Prompt
           → gpt-4o 流式生成 (temperature=0.3)
           → SSE 流式返回答案 + 来源引用
```

## 项目结构

```
paper-assistant/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx              # 根布局（导航框架）
│   │   ├── page.tsx                # 首页（Hero + 特性卡片）
│   │   ├── globals.css             # Tailwind + CSS 变量 + 暗色主题
│   │   ├── upload/page.tsx         # 上传页面
│   │   ├── papers/
│   │   │   ├── page.tsx            # 论文库列表
│   │   │   └── [id]/page.tsx       # 论文详情 + 处理状态轮询
│   │   ├── chat/[paperId]/page.tsx # 聊天问答页
│   │   └── api/
│   │       ├── upload/route.ts     # POST PDF 上传 + 后台索引
│   │       ├── papers/
│   │       │   ├── route.ts        # GET 列表 / POST 创建
│   │       │   └── [id]/route.ts   # GET 详情 / DELETE 删除
│   │       └── chat/route.ts       # POST RAG 流式问答 (SSE)
│   ├── components/
│   │   ├── ui/                     # shadcn/ui 基础组件
│   │   ├── layout/                 # AppHeader / AppSidebar
│   │   ├── pdf/                    # PdfUploader（拖拽上传）
│   │   ├── chat/                   # ChatInterface / ChatMessage / ChatInput / SourceCitation
│   │   └── paper/                  # PaperCard / PaperDeleteDialog
│   ├── lib/
│   │   ├── supabase/               # Supabase 客户端 (browser / server / admin)
│   │   ├── ai/                     # RAG 核心: embed / retrieve / generate
│   │   ├── pdf/                    # PDF 处理: parse / chunk / index
│   │   └── utils.ts                # cn() / formatFileSize() / formatDate()
│   ├── hooks/
│   │   └── use-chat.ts             # 聊天状态管理 + SSE 流解析
│   └── types/
│       └── index.ts                # 全栈共享类型定义
├── supabase/
│   └── migrations/
│       └── 001_init.sql            # 数据库建表 + pgvector + RLS
├── CLAUDE.md                       # AI 辅助开发文档
└── 配置文件 (package.json, tsconfig, tailwind, etc.)
```

## 快速开始

### 前置要求

- Node.js >= 18
- npm / pnpm
- [Supabase](https://supabase.com) 账号（免费 tier 即可）
- [OpenAI API Key](https://platform.openai.com/api-keys)

### 1. 克隆项目

```bash
git clone https://github.com/你的用户名/paper-assistant.git
cd paper-assistant
npm install
```

### 2. 配置 Supabase

1. 在 [Supabase Dashboard](https://supabase.com/dashboard) 创建新项目
2. 在 SQL Editor 中执行 `supabase/migrations/001_init.sql`
3. 在 Storage 中创建名为 `papers` 的 Bucket（设为私有）
4. 在 Storage → Policies 中添加 RLS 策略（见 SQL 文件的注释部分）
5. 在 Project Settings → API 中复制 `URL`、`anon key`、`service_role key`

### 3. 配置环境变量

```bash
cp .env.local.example .env.local
# 编辑 .env.local，填入真实凭证
```

必需变量：

```env
OPENAI_API_KEY=sk-你的密钥
NEXT_PUBLIC_SUPABASE_URL=https://你的项目.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的anon key
SUPABASE_SERVICE_ROLE_KEY=你的service role key
```

### 4. 启动

```bash
npm run dev
# 访问 http://localhost:3000
```

## 设计亮点

### 1. 分层架构

六层清晰分层：表现层 → 组件层 → Hooks 层 → API 层 → Lib 层 → 基础设施层。每层职责单一，依赖方向清晰。

### 2. Server Component 默认策略

默认使用 Server Component（首屏零 JS），仅在需要交互/状态时启用 Client Component（`"use client"`）。首页作为纯静态页面在服务端直接渲染为 HTML。

### 3. 流式体验

问答 API 使用 SSE（Server-Sent Events）协议，先推送引用来源，再逐 token 推送回答。用户无需等待完整响应。

### 4. 异步索引

PDF 上传后立即返回 201，索引在后台异步执行。前端通过轮询展示实时处理状态。

### 5. 安全设计

- RLS（Row Level Security）确保用户数据隔离
- Service Role Key 仅服务端使用，不暴露客户端
- 文件类型和大小双重验证（前端 + 后端）
- Storage Bucket 设为非公开，通过 RLS 策略控制访问

## 许可证

MIT
