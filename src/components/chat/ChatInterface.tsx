"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessageBubble } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { useChat } from "@/hooks/use-chat";

interface ChatInterfaceProps {
  paperId: string;
}

/**
 * 聊天界面主组件
 * 整合消息列表、输入框、来源引用
 */
export function ChatInterface({ paperId }: ChatInterfaceProps) {
  const { messages, isLoading, sources, error, sendMessage, clearMessages } =
    useChat({ paperId });

  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动到最新消息
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Messages Area */}
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <svg
                  className="h-8 w-8 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                  />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-semibold">开始论文问答</h3>
              <p className="max-w-sm text-sm text-muted-foreground">
                输入任何关于论文的问题，AI 将基于论文原文为你提供答案和引用。
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="rounded-full border bg-background px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-4">
              {messages.map((msg) => (
                <ChatMessageBubble
                  key={msg.id}
                  message={msg}
                  isStreaming={
                    isLoading &&
                    msg.role === "assistant" &&
                    msg.id === messages[messages.length - 1]?.id
                  }
                />
              ))}
              <div ref={scrollRef} />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Error Banner */}
      {error && (
        <div className="mx-auto max-w-3xl px-4">
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
            <button
              onClick={clearMessages}
              className="ml-auto text-xs underline"
            >
              重试
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="mx-auto w-full max-w-3xl">
        <ChatInput onSend={sendMessage} isLoading={isLoading} />
      </div>
    </div>
  );
}

/** 推荐问题 */
const SUGGESTED_QUESTIONS = [
  "这篇论文的核心贡献是什么？",
  "论文使用了什么方法？",
  "论文的实验结果如何？",
  "论文有什么局限性？",
  "请总结论文的主要内容",
];
