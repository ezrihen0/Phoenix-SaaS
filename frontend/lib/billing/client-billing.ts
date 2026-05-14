import { crmApiFetch } from "@/lib/crm/browser-api";

export type StripeCheckoutSessionPayload = {
  provider: "stripe";
  billing_account_id: string;
  session_id: string;
  url: string;
};

export async function createStripeCheckoutSession(planKey: "starter" | "pro" | "business") {
  return crmApiFetch<StripeCheckoutSessionPayload>("/api/billing/checkout-session", {
    method: "POST",
    body: JSON.stringify({ plan_key: planKey }),
  });
}
