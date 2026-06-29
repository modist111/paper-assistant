import { createBrowserClient } from "@supabase/ssr";

/**
 * 浏览器端 Supabase 客户端（单例）
 * 用于客户端组件中的数据库查询和认证操作。
 *
 * 使用方式:
 * ```ts
 * import { supabase } from "@/lib/supabase/client";
 * const { data } = await supabase.from("documents").select("*");
 * ```
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/** 预创建的浏览器客户端单例 */
export const supabase = createClient();
