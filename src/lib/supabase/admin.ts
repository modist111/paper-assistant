import { createClient } from "@supabase/supabase-js";

/**
 * 管理员 Supabase 客户端（Service Role）
 * ⚠️ 仅在服务端代码中使用！
 * 此客户端绕过 RLS 策略，拥有完全数据库访问权限。
 *
 * 使用场景：
 * - 向量搜索（绕过 RLS）
 * - 写入 document_chunks（与 user_id 无关）
 * - 后台管理操作
 *
 * 使用方式:
 * ```ts
 * import { supabaseAdmin } from "@/lib/supabase/admin";
 * const { data } = await supabaseAdmin.from("documents").select("*");
 * ```
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
