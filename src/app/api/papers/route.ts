import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth/user";

/**
 * GET /api/papers
 * 获取当前已验证用户的论文列表
 *
 * Query params:
 * - status: 按状态筛选 (processing | ready | error)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    // 获取筛选参数
    const { searchParams } = request.nextUrl;
    const statusFilter = searchParams.get("status");

    // 管理员客户端不依赖 RLS，因此必须固定过滤已验证的 user.id。
    let query = supabaseAdmin
      .from("documents")
      .select("*")
      .eq("user_id", user.id)
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
 * 禁用旧的元数据创建入口，防止客户端伪造 Storage 路径。
 */
export async function POST() {
  return NextResponse.json({ error: "请使用 /api/upload 上传文件并创建论文" }, { status: 405 });
}
