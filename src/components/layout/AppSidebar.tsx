"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Paper } from "@/types";

/**
 * 侧边栏 — 显示论文库列表
 * 仅在 /papers 和 /chat 路径下显示
 */
export function AppSidebar() {
  const pathname = usePathname();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 只在论文相关页面显示侧边栏
  const shouldShow = pathname.startsWith("/papers/") ||
    pathname.startsWith("/chat/") ||
    pathname === "/papers";

  // 加载论文列表
  useEffect(() => {
    if (!shouldShow) return;

    async function fetchPapers() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/papers");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setPapers(data.papers || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    }

    fetchPapers();
  }, [shouldShow]);

  if (!shouldShow) return null;

  return (
    <aside className="fixed left-0 top-14 h-[calc(100vh-3.5rem)] w-64 border-r bg-background">
      <div className="flex h-full flex-col">
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-4">
          <h2 className="text-sm font-semibold">论文库</h2>
          <Link
            href="/upload"
            className="flex h-7 w-7 items-center justify-center rounded-md border bg-background hover:bg-accent"
            title="上传新论文"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </Link>
        </div>

        {/* Paper List */}
        <ScrollArea className="flex-1 px-2">
          {loading && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              加载中...
            </div>
          )}

          {error && (
            <div className="p-4 text-center text-sm text-destructive">
              加载失败: {error}
            </div>
          )}

          {!loading && !error && papers.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              暂无论文，去上传一篇吧
            </div>
          )}

          {papers.map((paper) => {
            const isActive =
              pathname === `/papers/${paper.id}` ||
              pathname === `/chat/${paper.id}`;

            return (
              <Link
                key={paper.id}
                href={
                  paper.status === "ready"
                    ? `/chat/${paper.id}`
                    : `/papers/${paper.id}`
                }
                className={cn(
                  "mb-1 block rounded-md p-3 text-sm transition-colors hover:bg-accent",
                  isActive && "bg-accent"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="line-clamp-2 font-medium leading-tight">
                    {paper.title}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <StatusBadge status={paper.status} />
                  <span className="text-xs text-muted-foreground">
                    {formatDate(paper.created_at).split(" ")[0]}
                  </span>
                </div>
              </Link>
            );
          })}
        </ScrollArea>
      </div>
    </aside>
  );
}

/**
 * 状态徽章组件
 */
function StatusBadge({ status }: { status: Paper["status"] }) {
  switch (status) {
    case "processing":
      return (
        <Badge variant="secondary" className="text-xs py-0 h-5">
          <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
          处理中
        </Badge>
      );
    case "ready":
      return (
        <Badge variant="default" className="text-xs py-0 h-5">
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
          就绪
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive" className="text-xs py-0 h-5">
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-destructive-foreground" />
          失败
        </Badge>
      );
  }
}
