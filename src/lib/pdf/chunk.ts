import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

/**
 * 文本分块结果
 */
export interface TextChunk {
  /** 分块序号（从 0 开始） */
  index: number;
  /** 分块文本内容 */
  content: string;
  /** 内容哈希（SHA-256 前 16 字符，用于去重） */
  contentHash: string;
  /** 元信息 */
  metadata: {
    /** 起始字符位置 */
    startChar: number;
    /** 结束字符位置 */
    endChar: number;
  };
}

/**
 * 配置选项
 */
export interface ChunkOptions {
  /** 每个分块的最大字符数 */
  chunkSize?: number;
  /** 相邻分块的重叠字符数 */
  chunkOverlap?: number;
}

/**
 * 将文本分割为语义连贯的块
 *
 * 使用 RecursiveCharacterTextSplitter：
 * - 优先在段落/句子边界处分割
 * - 每个块约 1000 字符，重叠 200 字符
 * - 保留上下文连贯性
 *
 * @param text - 待分块的文本
 * @param options - 分块配置
 * @returns 文本块数组
 */
export async function chunkText(
  text: string,
  options: ChunkOptions = {}
): Promise<TextChunk[]> {
  const {
    chunkSize = 1000,
    chunkOverlap = 200,
  } = options;

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: [
      "\n\n",   // 段落分隔
      "\n",     // 行分隔
      ". ",     // 英文句号 + 空格
      "。",     // 中文句号
      "? ",     // 问号 + 空格
      "？",     // 中文问号
      "! ",     // 感叹号 + 空格
      "！",     // 中文感叹号
      "; ",     // 分号 + 空格
      "；",     // 中文分号
      " ",      // 空格
      "",       // 字符级分割（最后手段）
    ],
  });

  const documents = await splitter.createDocuments([text]);

  return documents.map((doc, index) => {
    const content = doc.pageContent;

    // 生成简单的内容哈希
    const contentHash = generateSimpleHash(content);

    return {
      index,
      content,
      contentHash,
      metadata: {
        startChar: text.indexOf(content),
        endChar: text.indexOf(content) + content.length,
      },
    };
  });
}

/**
 * 简单的字符串哈希函数（非加密级别，性能优先）
 */
function generateSimpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // 转为 16 进制字符串并填充到固定长度
  return Math.abs(hash).toString(16).padStart(16, "0");
}

export default chunkText;
