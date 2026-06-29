import OpenAI from "openai";

/**
 * Embedding 专用客户端
 * 默认使用 OpenAI text-embedding-3-small
 * 也可通过环境变量切换到其他兼容服务（如阿里云、硅基流动等）
 */
const embeddingClient = new OpenAI({
  apiKey: process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY,
  baseURL:
    process.env.EMBEDDING_API_BASE_URL ||
    process.env.OPENAI_API_BASE_URL ||
    "https://api.openai.com/v1",
});

const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL || "text-embedding-3-small";

/**
 * 将单段文本向量化
 * @param text - 输入文本
 * @returns 1536 维浮点数数组
 */
export async function embedText(text: string): Promise<number[]> {
  const response = await embeddingClient.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  return response.data[0].embedding;
}

/**
 * 批量将多段文本向量化
 * @param texts - 文本数组
 * @returns 二维 embedding 数组
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const response = await embeddingClient.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });

  // 按输入顺序排序
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

export { embeddingClient };
