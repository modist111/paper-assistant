import OpenAI from "openai";

/**
 * LLM 专用客户端
 *
 * 默认使用 OpenAI gpt-4o。可通过环境变量切换到任何兼容 API：
 *
 * DeepSeek:
 *   LLM_API_KEY=sk-your-deepseek-key
 *   LLM_API_BASE_URL=https://api.deepseek.com
 *   LLM_MODEL=deepseek-chat
 *
 * 其他兼容服务（阿里通义千问、硅基流动、Ollama 等）同理，只要支持 /v1/chat/completions 端点。
 */
export const llmClient = new OpenAI({
  apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY,
  baseURL:
    process.env.LLM_API_BASE_URL ||
    process.env.OPENAI_API_BASE_URL ||
    "https://api.openai.com/v1",
});

/**
 * 当前使用的 LLM 模型名
 */
export const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o";
