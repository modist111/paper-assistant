import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 服务端 Supabase 客户端
 * 用于 Server Components 和 API Routes 中带有 RLS 策略的查询。
 * 从 cookies 读取 session，自动以当前用户身份认证。
 *
 * 使用方式:
 * ```ts
 * // 在 Server Component 或 Route Handler 中
 * const supabase = await createClient();
 * const { data } = await supabase.from("documents").select("*");
 * ```
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as any)
            );
          } catch {
            // 在 Server Component 中调用 setAll 会被忽略
            // 如果有 middleware 刷新 session，可在 middleware 中处理
          }
        },
      },
    }
  );
}
