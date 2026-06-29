import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/papers/[id]
 * 获取单篇论文详情
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "请先登录" },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json(
        { error: "论文不存在", details: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json({ paper: data });
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
 *
 * 使用 admin client 确保可以删除 storage 文件（绕过 RLS）
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "请先登录" },
        { status: 401 }
      );
    }

    // 首先获取论文信息（确认所有权 + 获取 storage_path）
    const { data: paper, error: fetchError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) {
      return NextResponse.json(
        { error: "论文不存在", details: fetchError.message },
        { status: 404 }
      );
    }

    // 删除 Supabase Storage 中的文件
    if (paper.storage_path) {
      const { error: storageError } = await supabaseAdmin.storage
        .from("papers")
        .remove([paper.storage_path]);

      if (storageError) {
        console.warn(
          `[DELETE /api/papers/[id]] 删除存储文件失败: ${storageError.message}`
        );
      }
    }

    // 删除数据库记录（document_chunks 通过 CASCADE 自动删除）
    const { error: deleteError } = await supabase
      .from("documents")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error(
        `[DELETE /api/papers/[id]] 删除记录失败: ${deleteError.message}`
      );
      return NextResponse.json(
        { error: "删除论文失败", details: deleteError.message },
        { status: 500 }
      );
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
