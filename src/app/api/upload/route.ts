import { after, NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runNextIndexJob } from "@/lib/indexing/jobs";
import { assertEmbeddingConfigured } from "@/lib/ai/embed";
import { getAuthenticatedUser } from "@/lib/auth/user";

/** 允许的文件类型 */
const ALLOWED_MIME_TYPES = ["application/pdf"];

/** 最大文件大小：20MB */
const MAX_FILE_SIZE = 20 * 1024 * 1024;

export const maxDuration = 300;

/**
 * POST /api/upload
 * 上传 PDF 论文并触发索引流水线
 *
 * 请求格式：multipart/form-data
 * 字段：file (PDF 文件)
 *
 * 处理流程：
 * 1. 验证文件类型和大小
 * 2. 上传到 Supabase Storage
 * 3. 创建 documents 记录
 * 4. 异步触发索引流水线（不阻塞响应）
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (Number(request.headers.get("content-length")) > MAX_FILE_SIZE + 1024 * 1024) {
      return NextResponse.json({ error: "上传请求超过大小限制" }, { status: 413 });
    }

    // 解析 multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "请选择要上传的 PDF 文件" },
        { status: 400 }
      );
    }

    // 验证文件类型
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `仅支持 PDF 文件，当前类型: ${file.type}` },
        { status: 400 }
      );
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `文件大小超过限制 (最大 20MB)，当前: ${(file.size / 1024 / 1024).toFixed(1)}MB`,
        },
        { status: 400 }
      );
    }

    try {
      assertEmbeddingConfigured();
    } catch (error) {
      return NextResponse.json(
        {
          error: "Embedding 服务未配置",
          details: error instanceof Error ? error.message : "请检查 Embedding 配置",
        },
        { status: 503 }
      );
    }

    // 构建存储路径
    const timestamp = Date.now();
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${user.id}/${timestamp}_${safeFilename}`;

    // 上传到 Supabase Storage
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    if (!fileBuffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      return NextResponse.json({ error: "文件内容不是 PDF" }, { status: 400 });
    }

    const { error: uploadError } = await supabaseAdmin.storage
      .from("papers")
      .upload(storagePath, fileBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error(`[POST /api/upload] 存储上传失败: ${uploadError.message}`);
      return NextResponse.json(
        { error: "文件上传失败", details: uploadError.message },
        { status: 500 }
      );
    }

    // 服务端使用 admin 写入，但文档归属由已验证的 session user 固定。
    const paperTitle = file.name.replace(/\.pdf$/i, "");

    const { data: papers, error: insertError } = await supabaseAdmin.rpc("create_document_with_index_job", {
      p_user_id: user.id, p_title: paperTitle, p_filename: file.name,
      p_storage_path: storagePath, p_file_size: file.size,
    });
    const paper = papers?.[0];

    if (insertError || !paper) {
      console.error(
        `[POST /api/upload] 创建文档记录失败: ${insertError?.message ?? "未返回文档"}`
      );
      // 尝试清理已上传的文件
      await supabaseAdmin.storage.from("papers").remove([storagePath]);
      return NextResponse.json(
        { error: "创建论文记录失败，请确认已执行数据库迁移" },
        { status: 500 }
      );
    }

    // 让 Next.js 在响应发送后继续等待索引任务
    after(async () => {
      try {
        await runNextIndexJob(paper.id);
      } catch (error) {
        console.error("[POST /api/upload] 后台索引异常 (paperId=" + paper.id + "):", error);
      }
    });

    return NextResponse.json(
      {
        success: true,
        paperId: paper.id,
        message: "论文已上传，正在处理中...",
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error(`[POST /api/upload] 异常: ${message}`);
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 }
    );
  }
}
