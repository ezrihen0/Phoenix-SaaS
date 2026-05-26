import { Injectable } from "@nestjs/common";

import type { PdfRenderableDocument, PdfRenderOptions } from "./pdf-render.types";

const DEFAULT_MEDIA_BOX = "0 0 595.28 841.89";

@Injectable()
export class PdfRenderService {
  escapeText(value: string) {
    return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  renderContentStream(contentStream: string, options: PdfRenderOptions) {
    const fontObjects = options.fonts.map((font) =>
      `<< /Type /Font /Subtype /Type1 /BaseFont /${font.baseFont} >>`,
    );
    const fontDict = options.fonts.map((font, index) => `/${font.name} ${5 + index} 0 R`).join(" ");
    const mediaBox = options.mediaBox ?? DEFAULT_MEDIA_BOX;

    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [${mediaBox}] /Contents 4 0 R /Resources << /Font << ${fontDict} >> >> >>`,
      `<< /Length ${Buffer.byteLength(contentStream, "utf8")} >>\nstream\n${contentStream}\nendstream`,
      ...fontObjects,
    ];

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(pdf, "utf8"));
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });

    const xrefStart = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let index = 1; index < offsets.length; index += 1) {
      pdf += `${offsets[index].toString().padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    return Buffer.from(pdf, "utf8");
  }

  renderDocument(document: PdfRenderableDocument) {
    return {
      pdfBuffer: this.renderContentStream(document.contentStream, document),
      htmlSnapshot: document.htmlSnapshot ?? null,
    };
  }
}
