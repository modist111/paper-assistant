"use client";

import { useEffect, useState, use } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDate, formatFileSize } from "@/lib/utils";
import type { Paper } from "@/types";

function PaperDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [paper, setPaper] = useState<Paper | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 加载论文详情
  useEffect(() => {
    async function fetchPaper() {
      try {
        setLoading(true);
        const res = await fetch(`/api/papers/${id}`);
        if (!res.ok) throw new Error("论文不存在");
        const data = await res.json();
        setPaper(data.paper);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    }
    fetchPaper();
  }, [id]);

  // 轮询处理中的论文
  useEffect(() => {
    if (!paper || paper.status !== "processing") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/papers/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        setPaper(data.paper);
        if (data.paper.status !== "processing") {
          clearInterval(interval);
        }
      } catch {
        // 忽略轮询错误
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [paper?.status, id]);

  // 删除论文
  async function handleDelete() {
    if (!confirm("确定要删除这篇论文吗？")) return;

    try {
      const res = await fetch(`/api/papers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      router.push("/papers");
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (error || !paper) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <p className="text-muted-foreground">{error || "论文不存在"}</p>
        <Link href="/papers">
          <Button variant="outline" size="sm" className="mt-4">
            返回论文库
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/papers" className="hover:text-foreground">
          论文库
        </Link>
        <span>/</span>
        <span className="text-foreground">{paper.title}</span>
      </div>

      {/* Status Alert */}
      {paper.status === "processing" && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <div className="flex items-center gap-3">
            <svg
              className="h-5 w-5 animate-spin text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">
                论文正在处理中
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                正在提取文本、生成向量嵌入，请稍候...
              </p>
            </div>
          </div>
        </div>
      )}

      {paper.status === "error" && (
        <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="font-medium text-destructive">处理失败</p>
          {paper.error_message && (
            <p className="mt-1 text-sm text-destructive/80">
              {paper.error_message}
            </p>
          )}
        </div>
      )}

      {/* Paper Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="text-xl">{paper.title}</CardTitle>
            <StatusBadge status={paper.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">文件名</span>
              <p className="font-medium">{paper.filename}</p>
            </div>
            <div>
              <span className="text-muted-foreground">文件大小</span>
              <p className="font-medium">
                {paper.file_size ? formatFileSize(paper.file_size) : "-"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">页数</span>
              <p className="font-medium">{paper.page_count ?? "-"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">上传时间</span>
              <p className="font-medium">
                {formatDate(paper.created_at)}
              </p>
            </div>
          </div>

          <Separator />

          <div className="flex gap-3">
            {paper.status === "ready" && (
              <Link href={`/chat/${paper.id}`}>
                <Button className="gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                  </svg>
                  开始问答
                </Button>
              </Link>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
            >
              删除论文
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: Paper["status"] }) {
  switch (status) {
    case "processing":
      return <Badge variant="secondary">处理中</Badge>;
    case "ready":
      return <Badge variant="default">就绪</Badge>;
    case "error":
      return <Badge variant="destructive">失败</Badge>;
  }
}

// 禁用 SSR 避免 Windows spawn EPERM
const PaperDetailPage = dynamic(() => Promise.resolve(PaperDetailContent), {
  ssr: false,
});

export default PaperDetailPage;
