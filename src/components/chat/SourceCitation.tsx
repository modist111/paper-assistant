import { Card, CardContent } from "@/components/ui/card";
import type { SourceReference } from "@/types";

interface SourceCitationProps {
  sources: SourceReference[];
}

/**
 * 来源引用组件
 * 显示 RAG 检索到的论文片段，含相似度评分
 */
export function SourceCitation({ sources }: SourceCitationProps) {
  if (sources.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">引用来源：</p>
      {sources.map((source, i) => (
        <Card key={i} className="bg-muted/50">
          <CardContent className="p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium">
                片段 {source.chunk_index + 1}
                {source.page !== undefined && ` (第 ${source.page} 页)`}
              </span>
              <span className="text-xs text-muted-foreground">
                相似度: {(source.similarity * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-3">
              {source.content}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
