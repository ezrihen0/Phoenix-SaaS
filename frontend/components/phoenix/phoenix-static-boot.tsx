import {
  CRM_BRAND_NAME,
  CRM_LOGO_ALT,
  CRM_LOGO_SRC,
  CRM_SPLASH_BACKGROUND,
} from "@/lib/branding/crm-brand";

/** First-paint shell shown before React hydrates (matches iOS splash + in-app loader). */
export function PhoenixStaticBoot() {
  return (
    <div
      id="phoenix-static-boot"
      className="phoenix-static-boot"
      aria-hidden="false"
      style={{ backgroundColor: CRM_SPLASH_BACKGROUND }}
    >
      <div className="phoenix-static-boot-inner">
        <img
          src={CRM_LOGO_SRC}
          alt={CRM_LOGO_ALT}
          width={220}
          height={58}
          decoding="sync"
          fetchPriority="high"
        />
        <p className="phoenix-static-boot-label">{CRM_BRAND_NAME}</p>
      </div>
    </div>
  );
}
