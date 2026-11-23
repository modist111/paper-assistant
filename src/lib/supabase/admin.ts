import { createClient } from "@supabase/supabase-js";

/**
 * 管理员 Supabase 客户端（Service Role）
 * ⚠️ 仅在服务端代码中使用！
 * 此客户端绕过 RLS 策略，拥有完全数据库访问权限。
 *
 * 使用场景：
 * - 在 API 验证身份与论文归属后执行上传和删除
 * - 后台 worker 领取任务与原子发布索引（服务端专用 RPC）
 * 查询向量使用带用户会话的客户端，继续受 RLS 约束。
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
    global: {
      fetch: (input, init) => fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)])
          : AbortSignal.timeout(20_000),
      }),
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
