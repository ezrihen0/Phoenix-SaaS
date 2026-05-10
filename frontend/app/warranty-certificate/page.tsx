import WarrantyPDF from "@/components/warranty-pdf";

import styles from "@/components/warranty-pdf.module.css";

export default function WarrantyCertificatePage() {
  return (
    <main className={`${styles.previewShell} min-h-screen overflow-x-auto bg-[linear-gradient(180deg,#e2e8f0_0%,#f8fafc_100%)] px-4 py-6 print:bg-white print:p-0`}>
      <div className="mx-auto w-fit">
        <WarrantyPDF
          customerName="Jonathan & Elise Carter"
          serviceType="Premium Gas Fireplace Installation and Venting Upgrade"
          durationMonths={24}
          expiryDate="May 15, 2028"
          serialNumber="PHX-99281-02"
        />
      </div>
    </main>
  );
}
