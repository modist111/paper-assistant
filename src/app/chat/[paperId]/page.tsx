"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Paper } from "@/types";

export default function ChatPage({
  params,
}: {
  params: Promise<{ paperId: string }>;
}) {
  const { paperId } = use(params);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPaper() {
      try {
        setLoading(true);
        const res = await fetch(`/api/papers/${paperId}`);
        if (!res.ok) throw new Error("论文不存在");
        const data = await res.json();
        setPaper(data.paper);

        if (data.paper.status !== "ready") {
          setError("论文还未完成索引处理，无法进行问答");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    }
    fetchPaper();
  }, [paperId]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-sm text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mb-4 flex justify-center">
            <svg className="h-12 w-12 text-destructive" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/papers">返回论文库</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Chat Header Bar */}
      {paper && (
        <div className="border-b bg-background px-4 py-2">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <Link
              href={`/papers/${paper.id}`}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← 返回
            </Link>
            <span className="text-sm font-medium truncate">
              {paper.title}
            </span>
            <Badge variant="default" className="text-xs">
              问答中
            </Badge>
          </div>
        </div>
      )}

      {/* Chat Interface */}
      <ChatInterface paperId={paperId} />
    </div>
  );
}
