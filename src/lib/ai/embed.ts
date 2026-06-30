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
 * 批量将多段文本向量化（带限速重试）
 * @param texts - 文本数组
 * @returns 二维 embedding 数组
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  // 尝试批量请求，失败则逐条重试
  try {
    const response = await embeddingClient.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    });

    return response.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  } catch (batchError) {
    const errMsg = batchError instanceof Error ? batchError.message : "";
    console.warn(`[Embed] 批量向量化失败 (${errMsg})，切换逐条模式...`);

    // 逐条向量化，每条间隔 200ms
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      let retries = 3;
      while (retries > 0) {
        try {
          const emb = await embedText(texts[i]);
          results.push(emb);
          break;
        } catch (singleError) {
          retries--;
          if (retries === 0) {
            console.error(`[Embed] 第 ${i + 1} 条向量化最终失败:`, singleError);
            // 返回零向量作为占位（1024 维）
            results.push(new Array(1024).fill(0));
          } else {
            // 等 3 秒后重试
            await new Promise((r) => setTimeout(r, 3000));
          }
        }
      }
      // 每条间隔 200ms
      if (i < texts.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    return results;
  }
}

export { embeddingClient };
