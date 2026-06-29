"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PaperCard } from "@/components/paper/PaperCard";
import { PaperDeleteDialog } from "@/components/paper/PaperDeleteDialog";
import { Button } from "@/components/ui/button";
import type { Paper } from "@/types";

export default function PapersPage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Paper | null>(null);

  // 加载论文列表
  useEffect(() => {
    fetchPapers();
  }, []);

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

  // 删除论文
  async function handleDelete() {
    if (!deleteTarget) return;

    try {
      const res = await fetch(`/api/papers/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "删除失败");
      }

      setPapers((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">论文库</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理你上传的所有论文
          </p>
        </div>
        <Link href="/upload">
          <Button className="gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            上传论文
          </Button>
        </Link>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-destructive">加载失败: {error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={fetchPapers}
          >
            重试
          </Button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && papers.length === 0 && (
        <div className="rounded-lg border bg-muted/30 p-12 text-center">
          <div className="mb-3 flex justify-center">
            <svg className="h-12 w-12 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <p className="text-muted-foreground">暂无论文</p>
          <Link href="/upload">
            <Button variant="outline" size="sm" className="mt-3">
              上传第一篇论文
            </Button>
          </Link>
        </div>
      )}

      {/* Paper Grid */}
      {!loading && papers.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {papers.map((paper) => (
            <PaperCard
              key={paper.id}
              paper={paper}
              onDelete={(id) => {
                const target = papers.find((p) => p.id === id);
                if (target) setDeleteTarget(target);
              }}
            />
          ))}
        </div>
      )}

      {/* Delete Dialog */}
      {deleteTarget && (
        <PaperDeleteDialog
          open={!!deleteTarget}
          paperTitle={deleteTarget.title}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
