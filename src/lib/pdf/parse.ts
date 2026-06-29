import pdfParse from "pdf-parse";

/**
 * PDF 文本提取结果
 */
export interface ParsedPdf {
  /** 提取的完整文本 */
  text: string;
  /** PDF 总页数 */
  pageCount: number;
  /** PDF 元信息 */
  info: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creator?: string;
    producer?: string;
    creationDate?: Date;
    modDate?: Date;
  };
}

/**
 * 从 Buffer 中提取 PDF 文本
 *
 * @param buffer - PDF 文件的原始字节数据
 * @returns 解析后的文本和元信息
 */
export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedPdf> {
  const data = await pdfParse(buffer);

  return {
    text: data.text,
    pageCount: data.numpages,
    info: {
      title: data.info?.Title,
      author: data.info?.Author,
      subject: data.info?.Subject,
      keywords: data.info?.Keywords,
      creator: data.info?.Creator,
      producer: data.info?.Producer,
      creationDate: data.info?.CreationDate,
      modDate: data.info?.ModDate,
    },
  };
}
