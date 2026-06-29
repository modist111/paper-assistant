import { PdfUploader } from "@/components/pdf/PdfUploader";

export default function UploadPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">上传论文</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            上传 PDF 格式的学术论文，系统将自动解析并建立索引，之后你可以就论文内容进行智能问答。
          </p>
        </div>

        <PdfUploader />

        {/* Tips */}
        <div className="mt-8 rounded-lg border bg-muted/30 p-6">
          <h3 className="mb-3 font-semibold text-sm">上传提示</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-primary">✓</span>
              支持标准 PDF 格式（文本型 PDF 效果最佳）
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-primary">✓</span>
              文件大小上限为 20MB
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-primary">✓</span>
              处理时间取决于论文长度，通常 10-30 秒
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-primary">✓</span>
              扫描版 PDF（纯图片）可能无法提取文本
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
