import OpenAI from "openai";

/**
 * Embedding 专用客户端
 * 示例默认使用硅基流动 BAAI/bge-m3；可显式配置其他兼容服务。
 */
const embeddingApiKey = process.env.EMBEDDING_API_KEY;

export function assertEmbeddingConfigured(): void {
  if (!embeddingApiKey || /^sk-your-/i.test(embeddingApiKey)) {
    throw new Error("请在 .env.local 中配置有效的 EMBEDDING_API_KEY");
  }
  if (!Number.isInteger(EMBEDDING_DIMENSIONS) || EMBEDDING_DIMENSIONS <= 0) {
    throw new Error("EMBEDDING_DIMENSIONS 必须是正整数");
  }
}

const embeddingClient = new OpenAI({
  apiKey: embeddingApiKey || "not-configured",
  baseURL: process.env.EMBEDDING_API_BASE_URL || "https://api.siliconflow.cn/v1",
  timeout: 20_000,
  maxRetries: 1,
});

export const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL || "BAAI/bge-m3";

// The pgvector column and search RPC must use the same dimension.
export const EMBEDDING_DIMENSIONS = Number(
  process.env.EMBEDDING_DIMENSIONS ||
    (EMBEDDING_MODEL === "BAAI/bge-m3" ? 1024 : 1536)
);

function assertEmbeddingDimensions(embedding: number[]): void {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      "Embedding 模型 " + EMBEDDING_MODEL + " 返回 " + embedding.length +
      " 维，预期 " + EMBEDDING_DIMENSIONS +
      " 维；请检查 EMBEDDING_DIMENSIONS 和数据库向量维度"
    );
  }
}

/**
 * 将单段文本向量化
 * @param text - 输入文本
 * @returns 与数据库向量维度一致的浮点数数组
 */
export async function embedText(text: string): Promise<number[]> {
  assertEmbeddingConfigured();
  const response = await embeddingClient.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) throw new Error("Embedding API 未返回向量");
  assertEmbeddingDimensions(embedding);
  return embedding;
}

/**
 * 批量将多段文本向量化（失败时交由索引流程记录错误）
 * @param texts - 文本数组
 * @returns 二维 embedding 数组
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  assertEmbeddingConfigured();
  const response = await embeddingClient.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });

  const embeddings = response.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);

  if (embeddings.length !== texts.length) {
    throw new Error("Embedding 返回的向量数量与文本数量不一致");
  }
  embeddings.forEach(assertEmbeddingDimensions);

  return embeddings;
}

export { embeddingClient };
