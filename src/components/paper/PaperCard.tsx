"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatFileSize } from "@/lib/utils";
import type { Paper } from "@/types";

interface PaperCardProps {
  paper: Paper;
  onDelete?: (id: string) => void;
}

export function PaperCard({ paper, onDelete }: PaperCardProps) {
  return (
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        {/* Status + Actions */}
        <div className="mb-3 flex items-center justify-between">
          <PaperStatusBadge status={paper.status} />
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => onDelete(paper.id)}
            >
              <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </Button>
          )}
        </div>

        {/* Title */}
        <Link
          href={
            paper.status === "ready"
              ? `/chat/${paper.id}`
              : `/papers/${paper.id}`
          }
          className="block"
        >
          <h3 className="mb-2 line-clamp-2 font-semibold leading-snug hover:text-primary transition-colors">
            {paper.title}
          </h3>
        </Link>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{paper.filename}</span>
          {paper.file_size && <span>{formatFileSize(paper.file_size)}</span>}
          {paper.page_count && <span>{paper.page_count} 页</span>}
          <span className="ml-auto">{formatDate(paper.created_at)}</span>
        </div>

        {/* Actions */}
        {paper.status === "ready" && (
          <div className="mt-3 flex gap-2">
            <Link href={`/chat/${paper.id}`} className="flex-1">
              <Button variant="default" size="sm" className="w-full">
                开始问答
              </Button>
            </Link>
            <Link href={`/papers/${paper.id}`}>
              <Button variant="outline" size="sm">
                详情
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 论文状态徽章
 */
function PaperStatusBadge({ status }: { status: Paper["status"] }) {
  switch (status) {
    case "processing":
      return (
        <Badge variant="secondary" className="gap-1">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
          处理中
        </Badge>
      );
    case "ready":
      return (
        <Badge variant="default" className="gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
          就绪
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive" className="gap-1">
          失败
        </Badge>
      );
  }
}
