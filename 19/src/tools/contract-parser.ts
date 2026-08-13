import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { promises as fs } from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export async function parseContractFile(filePath: string): Promise<{ text: string; format: string; charCount: number }> {
  const ext = path.extname(filePath).toLowerCase();
  let text = "";

  if (ext === ".docx") {
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else if (ext === ".pdf") {
    const buffer = await fs.readFile(filePath);
    const result = await pdfParse(buffer);
    text = result.text;
  } else if (ext === ".txt") {
    text = await fs.readFile(filePath, "utf-8");
  } else {
    throw new Error(`不支持的文件格式: ${ext}`);
  }

  return { text, format: ext, charCount: text.length };
}

export const parseContractTool = defineTool({
  name: "parse_contract",
  label: "解析合同",
  description: "解析 Word/PDF/文本合同，提取纯文本和基础元数据（文件名、格式、字符数）。",
  parameters: Type.Object({
    filePath: Type.String({ description: "合同文件路径，支持 .docx/.pdf/.txt" }),
  }),

  async execute(_toolCallId, { filePath }) {
    const { text, format, charCount } = await parseContractFile(filePath);

    const maxContentChars = 10000;
    const previewText = charCount > maxContentChars
      ? text.slice(0, maxContentChars) + "\n\n[合同文本较长，后续内容已截断]"
      : text;

    return {
      content: [
        {
          type: "text",
          text:
            `已解析 ${path.basename(filePath)}，格式 ${format}，共 ${charCount} 个字符。\n\n` +
            `以下是合同正文：\n\n${previewText}`,
        },
      ],
      details: {
        filePath,
        fileName: path.basename(filePath),
        format,
        charCount,
        text,
      },
    };
  },
});
