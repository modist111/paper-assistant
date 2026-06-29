"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface PaperDeleteDialogProps {
  open: boolean;
  paperTitle: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function PaperDeleteDialog({
  open,
  paperTitle,
  onConfirm,
  onCancel,
}: PaperDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>
            确定要删除论文「{paperTitle}」吗？此操作将同时删除：
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc pl-6 text-sm text-muted-foreground">
          <li>PDF 文件（云存储）</li>
          <li>所有文本块和向量嵌入</li>
          <li>相关的聊天记录</li>
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={deleting}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "删除中..." : "确认删除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
