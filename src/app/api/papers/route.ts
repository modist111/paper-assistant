import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/papers
 * 获取论文列表（开发模式：无认证，使用 admin 客户端）
 *
 * Query params:
 * - status: 按状态筛选 (processing | ready | error)
 */
export async function GET(request: NextRequest) {
  try {
    // 获取筛选参数
    const { searchParams } = request.nextUrl;
    const statusFilter = searchParams.get("status");

    // 查询论文（admin 客户端绕过 RLS）
    let query = supabaseAdmin
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`[GET /api/papers] 查询失败: ${error.message}`);
      return NextResponse.json(
        { error: "获取论文列表失败", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ papers: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error(`[GET /api/papers] 异常: ${message}`);
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/papers
 * 创建新的论文记录（不包含文件上传，仅创建元数据）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, filename, storage_path, file_size } = body;

    if (!title || !filename || !storage_path) {
      return NextResponse.json(
        { error: "缺少必要字段: title, filename, storage_path" },
        { status: 400 }
      );
    }

    const DEMO_USER_ID = "00000000-0000-0000-0000-000000000000";

    const { data, error } = await supabaseAdmin
      .from("documents")
      .insert({
        user_id: DEMO_USER_ID,
        title,
        filename,
        storage_path,
        file_size: file_size || null,
        status: "processing",
      })
      .select()
      .single();

    if (error) {
      console.error(`[POST /api/papers] 创建失败: ${error.message}`);
      return NextResponse.json(
        { error: "创建论文记录失败", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ paper: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error(`[POST /api/papers] 异常: ${message}`);
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 }
    );
  }
}
