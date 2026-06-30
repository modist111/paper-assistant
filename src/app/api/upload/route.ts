import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runIndexPipeline } from "@/lib/pdf";

/** 允许的文件类型 */
const ALLOWED_MIME_TYPES = ["application/pdf"];

/** 最大文件大小：20MB */
const MAX_FILE_SIZE = 20 * 1024 * 1024;

/** 演示用户 ID（开发阶段使用，无认证模式） */
const DEMO_USER_ID = "00000000-0000-0000-0000-000000000000";

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

    // 构建存储路径
    const timestamp = Date.now();
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${DEMO_USER_ID}/${timestamp}_${safeFilename}`;

    // 上传到 Supabase Storage
    const fileBuffer = Buffer.from(await file.arrayBuffer());

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

    // 创建数据库记录（使用 admin 客户端绕过 RLS）
    const paperTitle = file.name.replace(/\.pdf$/i, "");

    const { data: paper, error: insertError } = await supabaseAdmin
      .from("documents")
      .insert({
        user_id: DEMO_USER_ID,
        title: paperTitle,
        filename: file.name,
        storage_path: storagePath,
        file_size: file.size,
        status: "processing",
      })
      .select()
      .single();

    if (insertError) {
      console.error(
        `[POST /api/upload] 创建文档记录失败: ${insertError.message}`
      );
      // 尝试清理已上传的文件
      await supabaseAdmin.storage.from("papers").remove([storagePath]);
      return NextResponse.json(
        { error: "创建论文记录失败", details: insertError.message },
        { status: 500 }
      );
    }

    // 异步触发索引流水线（不等待完成，立即返回响应）
    runIndexPipeline({
      documentId: paper.id,
      pdfBuffer: fileBuffer,
    }).catch((err) => {
      console.error(
        `[POST /api/upload] 后台索引失败 (paperId=${paper.id}):`,
        err
      );
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
