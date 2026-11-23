"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    setError("");

    try {
      const result = mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

      if (result.error) {
        setError(result.error.message);
        return;
      }
      if (mode === "signup" && !result.data.session) {
        setNotice("注册成功。请完成邮件验证后返回此页登录。");
        return;
      }

      const destination = new URLSearchParams(window.location.search).get("next") || "/papers";
      const safeDestination = destination.startsWith("/") && !destination.startsWith("//") && !destination.includes("\\");
      router.replace(safeDestination ? destination : "/papers");
      router.refresh();
    } catch {
      setError("登录服务暂时不可用，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md items-center px-4 py-10">
      <section className="w-full">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">返回首页</Link>
        <h1 className="mt-6 text-2xl font-semibold">{mode === "login" ? "登录论文助手" : "创建账号"}</h1>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block space-y-2 text-sm">
            <span>邮箱</span>
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block space-y-2 text-sm">
            <span>密码</span>
            <Input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? "请稍候..." : mode === "login" ? "登录" : "注册"}</Button>
        </form>
        <button type="button" className="mt-4 text-sm text-primary hover:underline" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setNotice(""); }}>
          {mode === "login" ? "还没有账号？注册" : "已有账号？登录"}
        </button>
      </section>
    </main>
  );
}
