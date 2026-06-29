import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/papers
 * 获取当前用户的论文列表
 *
 * Query params:
 * - status: 按状态筛选 (processing | ready | error)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 获取当前用户
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

    // 获取筛选参数
    const { searchParams } = request.nextUrl;
    const statusFilter = searchParams.get("status");

    // 查询论文
    let query = supabase
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
    const supabase = await createClient();

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

    const body = await request.json();
    const { title, filename, storage_path, file_size } = body;

    if (!title || !filename || !storage_path) {
      return NextResponse.json(
        { error: "缺少必要字段: title, filename, storage_path" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("documents")
      .insert({
        user_id: user.id,
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
