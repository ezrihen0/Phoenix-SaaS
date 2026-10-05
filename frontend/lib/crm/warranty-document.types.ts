export type WarrantyCoverageStatus = "in_force" | "expired" | "no_term";

export type WarrantyTermsMode = "uniform" | "mixed" | "none";

export type WarrantyDocumentLine = {
  name: string;
  description: string | null;
  quantity: string;
  warrantyMonths: number | null;
  termLabel: string | null;
  expiryLabel: string | null;
};

export type WarrantyDocumentViewModel = {
  documentVersion: number;
  frozen: boolean;
  certificateNumber: string;
  invoiceNumber: string | null;
  jobTitle: string | null;
  warrantyType: string;
  coverageStatus: WarrantyCoverageStatus;
  coverageStatusLabel: string;
  termsMode: WarrantyTermsMode;
  coverageTermLabel: string | null;
  termsSummaryLabel: string;
  effectiveDateCaption: string;
  effectiveDateLabel: string;
  expirationCaption: string | null;
  expirationDateLabel: string | null;
  expirationIsLatest: boolean;
  completionDateLabel: string;
  customerName: string;
  customerCompany: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddressLines: string[];
  propertyLabel: string;
  coveredAssetLabel: string | null;
  coverageText: string;
  exclusionsText: string;
  companyName: string;
  companyNameIsFallback: boolean;
  companyLogoUrl: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  companyAddress: string | null;
  companyLicense: string | null;
  companyTaxNumber: string | null;
  accentColor: string | null;
  emptyTermLabel: string;
  lineItems: WarrantyDocumentLine[];
};
