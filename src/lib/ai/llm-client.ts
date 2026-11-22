import OpenAI from "openai";

const llmApiKey = process.env.LLM_API_KEY;

export function assertLlmConfigured(): void {
  if (!llmApiKey || /^sk-your-/i.test(llmApiKey)) {
    throw new Error("请在 .env.local 中配置有效的 LLM_API_KEY");
  }
}

/**
 * LLM 专用客户端
 *
 * 示例默认使用硅基流动 Qwen；可通过环境变量切换到兼容 API：
 *
 * DeepSeek:
 *   LLM_API_KEY=sk-your-deepseek-key
 *   LLM_API_BASE_URL=https://api.deepseek.com
 *   LLM_MODEL=deepseek-chat
 *
 * 其他兼容服务（阿里通义千问、硅基流动、Ollama 等）同理，只要支持 /v1/chat/completions 端点。
 */
export const llmClient = new OpenAI({
  apiKey: llmApiKey || "not-configured",
  baseURL: process.env.LLM_API_BASE_URL || "https://api.siliconflow.cn/v1",
  timeout: 45_000,
  maxRetries: 0,
});

/**
 * 当前使用的 LLM 模型名
 */
export const LLM_MODEL = process.env.LLM_MODEL || "Qwen/Qwen2.5-7B-Instruct";
