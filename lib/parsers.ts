import JSZip from "jszip";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

import type { ParsedDocument } from "@/types";

async function parsePptx(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((key) => key.startsWith("ppt/slides/slide") && key.endsWith(".xml"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const slideTexts = await Promise.all(
    slideFiles.map(async (fileName) => {
      const xml = await zip.file(fileName)?.async("text");
      return (xml || "")
        .match(/<a:t>(.*?)<\/a:t>/g)?.map((segment) => segment.replace(/<\/?a:t>/g, ""))?.join(" ") ?? "";
    })
  );

  return slideTexts.join("\n");
}

export async function parseDocument(file: File): Promise<ParsedDocument> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".pdf")) {
    const pdf = await pdfParse(buffer);
    return { title: file.name.replace(".pdf", ""), content: pdf.text, sourceType: "pdf" };
  }

  if (lowerName.endsWith(".docx")) {
    const docx = await mammoth.extractRawText({ buffer });
    return { title: file.name.replace(".docx", ""), content: docx.value, sourceType: "docx" };
  }

  if (lowerName.endsWith(".pptx")) {
    const text = await parsePptx(buffer);
    return { title: file.name.replace(".pptx", ""), content: text, sourceType: "pptx" };
  }

  throw new Error("Unsupported file type. Please upload a PDF, DOCX, or PPTX file.");
}
