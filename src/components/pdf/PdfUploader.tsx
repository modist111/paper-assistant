"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * PDF 上传组件
 * 支持拖拽和点击选择文件
 */
export function PdfUploader() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      // 客户端验证
      if (file.type !== "application/pdf") {
        setError("仅支持 PDF 文件");
        return;
      }

      if (file.size > 20 * 1024 * 1024) {
        setError("文件大小不能超过 20MB");
        return;
      }

      setError(null);
      setUploading(true);
      setProgress("正在上传...");

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "上传失败");
        }

        setProgress("上传成功，正在解析论文...");

        // 跳转到论文详情页（会显示处理状态）
        if (data.paperId) {
          router.push(`/papers/${data.paperId}`);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "上传过程中发生未知错误"
        );
      } finally {
        setUploading(false);
      }
    },
    [router]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          "relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50",
          uploading && "cursor-not-allowed opacity-60"
        )}
      >
        <input {...getInputProps()} />

        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <svg
            className="h-7 w-7 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
        </div>

        {isDragActive ? (
          <p className="text-sm text-primary">松开以添加文件</p>
        ) : (
          <div className="text-center">
            <p className="text-sm font-medium">
              拖拽 PDF 文件到此处，或点击选择
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              支持 PDF 格式，最大 20MB
            </p>
          </div>
        )}
      </div>

      {/* Progress */}
      {uploading && (
        <div className="rounded-lg bg-primary/5 p-4">
          <div className="flex items-center gap-3">
            <svg
              className="h-5 w-5 animate-spin text-primary"
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
            <span className="text-sm text-muted-foreground">
              {progress}
            </span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-destructive/10 p-4">
          <div className="flex items-center gap-3">
            <svg
              className="h-5 w-5 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            <span className="text-sm text-destructive">{error}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 text-xs"
              onClick={() => setError(null)}
            >
              关闭
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
