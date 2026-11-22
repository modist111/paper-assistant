import type { Metadata } from "next";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 论文阅读助手",
  description: "上传 PDF 论文，使用 AI 进行智能问答和分析",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="font-sans antialiased">
        <div className="flex min-h-screen flex-col">
          <AppHeader />
          <div className="flex flex-1">
            <AppSidebar />
            <main className="flex-1 transition-all">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
