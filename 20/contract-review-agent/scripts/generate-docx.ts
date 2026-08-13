import { Document, Paragraph, Packer } from "docx";
import { promises as fs } from "node:fs";

async function main() {
  const text = await fs.readFile("sample-contract.txt", "utf-8");
  const lines = text.split("\n");

  const children = lines.map((line) =>
    new Paragraph({
      text: line.trim(),
      spacing: { after: 120 },
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile("sample-contract.docx", buffer);
  console.log("已生成 sample-contract.docx");
}

main().catch(console.error);
