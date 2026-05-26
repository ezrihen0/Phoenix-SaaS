export type PdfFontDefinition = {
  name: string;
  baseFont: string;
};

export type PdfRenderOptions = {
  fonts: PdfFontDefinition[];
  mediaBox?: string;
};

export type PdfRenderableDocument = PdfRenderOptions & {
  contentStream: string;
  htmlSnapshot?: string | null;
};

export type PdfRenderedDocument = {
  pdfBuffer: Buffer;
  htmlSnapshot: string | null;
};

export type PdfDownloadResponseOptions = {
  filename: string;
  download?: string | boolean | null;
};

export type DocumentBrandingSnapshot = {
  businessName: string | null;
  displayInitials: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  paymentInstructions: string | null;
  businessLicense: string | null;
  gstNumber: string | null;
  warrantyMessage: string | null;
  invoicePdfFooter: string | null;
  companyAddress: string | null;
};
