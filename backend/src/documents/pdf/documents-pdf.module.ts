import { Module } from "@nestjs/common";

import { DocumentBrandingSnapshotService } from "./document-branding-snapshot.service";
import { PdfRenderService } from "./pdf-render.service";

@Module({
  providers: [DocumentBrandingSnapshotService, PdfRenderService],
  exports: [DocumentBrandingSnapshotService, PdfRenderService],
})
export class DocumentsPdfModule {}
