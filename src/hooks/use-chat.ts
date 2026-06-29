"use client";

import { useState, useCallback, useRef } from "react";
import type { ChatMessage, SourceReference } from "@/types";

interface UseChatOptions {
  /** 论文 ID */
  paperId: string;
  /** 对话初始化消息 */
  initialMessages?: ChatMessage[];
}

interface UseChatReturn {
  /** 消息列表 */
  messages: ChatMessage[];
  /** 是否正在生成回复 */
  isLoading: boolean;
  /** 当前来源引用 */
  sources: SourceReference[];
  /** 错误信息 */
  error: string | null;
  /** 发送消息 */
  sendMessage: (content: string) => Promise<void>;
  /** 清空消息 */
  clearMessages: () => void;
}

/**
 * 聊天状态管理 Hook
 * 处理 SSE 流式响应
 */
export function useChat({
  paperId,
  initialMessages = [],
}: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [sources, setSources] = useState<SourceReference[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      setError(null);

      // 添加用户消息
      const userMessage: ChatMessage = {
        id: `user_${Date.now()}`,
        role: "user",
        content,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      // 创建 AbortController
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        // 构建对话历史
        const history = messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .slice(-10) // 最近 10 条
          .map((m) => ({ role: m.role, content: m.content }));

        // 发送请求到 /api/chat
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paperId,
            question: content,
            history,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${response.status}`);
        }

        // 处理 SSE 流
        const reader = response.body?.getReader();
        if (!reader) throw new Error("无法读取响应流");

        const decoder = new TextDecoder();
        let assistantContent = "";

        // 创建占位消息
        const assistantId = `assistant_${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: "assistant",
            content: "",
          },
        ]);

        // 读取流
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;

            const jsonStr = trimmed.slice(6);
            try {
              const event = JSON.parse(jsonStr);

              if (event.type === "sources") {
                setSources(event.sources || []);
              } else if (event.type === "chunk") {
                assistantContent += event.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: assistantContent }
                      : m
                  )
                );
              } else if (event.type === "done") {
                // 流结束
              } else if (event.type === "error") {
                throw new Error(event.message || "生成失败");
              }
            } catch {
              // 解析失败的行，跳过
            }
          }
        }

        // 更新最终消息
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: assistantContent, sources }
              : m
          )
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const message =
          err instanceof Error ? err.message : "发送失败";
        setError(message);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [paperId, messages, isLoading, sources]
  );

  const clearMessages = useCallback(() => {
    // 取消正在进行的请求
    abortControllerRef.current?.abort();
    setMessages(initialMessages);
    setSources([]);
    setError(null);
    setIsLoading(false);
  }, [initialMessages]);

  return {
    messages,
    isLoading,
    sources,
    error,
    sendMessage,
    clearMessages,
  };
}
