import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth/user";

/**
 * GET /api/papers/[id]
 * 获取单篇论文详情
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error) {
      return NextResponse.json(
        { error: "论文不存在", details: error.message },
        { status: 404 }
      );
    }

    const { data: job, error: jobError } = await supabaseAdmin.from("document_index_jobs")
      .select("status,step,attempts,max_attempts,completed_chunks,total_chunks,lease_expires_at,next_attempt_at")
      .eq("document_id", id).eq("user_id", user.id).maybeSingle();
    if (jobError) return NextResponse.json({ error: "读取索引任务失败，请确认已执行数据库迁移" }, { status: 500 });
    const retryAvailable = data.status !== "ready" && (!job || job.status === "error" || job.status === "queued" ||
      (job.status === "processing" && Date.parse(job.lease_expires_at) <= Date.now()));
    return NextResponse.json({ paper: { ...data, retry_available: retryAvailable }, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error(`[GET /api/papers/[id]] 异常: ${message}`);
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/papers/[id]
 * 删除论文及其关联数据（chunks + storage 文件）
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const { id } = await params;

    // 首先获取论文信息（获取 storage_path）
    const { data: paper, error: fetchError } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchError) {
      return NextResponse.json(
        { error: "论文不存在", details: fetchError.message },
        { status: 404 }
      );
    }

    // Lock the job before deleting the document. A late worker cannot publish after deletion.
    const { data: storagePath, error: deleteError } = await supabaseAdmin.rpc("delete_owned_document", {
      p_document_id: id, p_user_id: user.id,
    });
    if (deleteError) return NextResponse.json({ error: "删除论文失败" }, { status: 500 });
    if (!storagePath) return NextResponse.json({ error: "论文不存在" }, { status: 404 });

    // Object storage is outside the DB transaction. Record a cleanup error without reviving deleted data.
    if (paper.storage_path) {
      const { error: storageError } = await supabaseAdmin.storage
        .from("papers")
        .remove([storagePath]);

      if (storageError) {
        console.warn(
          `[DELETE /api/papers/[id]] 删除存储文件失败: ${storageError.message}`
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error(`[DELETE /api/papers/[id]] 异常: ${message}`);
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 }
    );
  }
}
