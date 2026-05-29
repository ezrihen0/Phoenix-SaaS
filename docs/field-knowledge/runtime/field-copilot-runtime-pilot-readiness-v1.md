# Field Copilot Runtime Pilot Readiness v1

## 1. Current Runtime State

Runtime-wired domains:

- `gas_fireplace`
- `doors_windows`

Approved/runtime-capable trade areas:

- Gas fireplace, Alberta professional text surfaces.
- Gas fireplace, Calgary and Edmonton permit pack selection when location is explicitly supported.
- Doors-windows, Alberta professional text surfaces as wired by the runtime gates.

Candidate-only or not runtime-ready:

- Chimney is not an approved runtime domain.
- Garage-door is not an approved runtime domain.
- Candidate packs remain planning inputs only and must not load at runtime.
- AI Voice booking is not implemented and is not ready.

Surface readiness:

- Ready for limited internal text pilot: professional surfaces only, approved roles only, active organization context required.
- Not ready: `ai_voice_phone` live booking, `customer_portal`, and `public_site`.
- Restricted surfaces block professional mechanical guidance in the adversarial runner.
- Emergency hard-stop traps now pass 10/10 in the adversarial runner.

## 2. Recommended First Pilot

Recommendation: **gas-fireplace only, text Field Copilot first, no AI Voice live booking yet.**

Why:

- Gas fireplace has the strongest Alberta runtime wiring and existing regression coverage.
- Calgary and Edmonton permit pack selection is explicitly covered where supported.
- Unsupported jurisdiction fallback behavior exists.
- Runtime S0/S1 adversarial checks now pass, including emergency hard-stops, surface blocking, path blocking, and AI Voice repair-step refusal.

## 3. Why Not All Trades

- Chimney: planning appendix exists, but no approved runtime domain is wired.
- Garage-door: emergency phrases are now classified safely, but garage-door is still not an approved runtime domain.
- Doors-windows voice: emergency/security exposure now gates safely, but voice-specific approved pack fields and voice QA policy are still missing.
- All trades at once: would combine candidate-only domains, uneven approved-pack maturity, and unsupported public/voice surfaces into one rollout.

## 4. Required Before AI Voice Pilot

- Voice-safe pack fields approved and available for runtime use.
- Dedicated voice QA pass with 100% emergency escalation.
- Human transfer policy for emergency, angry caller, uncertain trade, and unsupported jurisdiction paths.
- Emergency scripts by trade, including gas, CO, fire/smoke, injury, entrapment, spring/cable/off-track, broken glass, security exposure, and electrical burning smell.
- Service area policy that distinguishes lead capture from confirmed appointment.
- Audit review of every voice fallback and refusal path.
- Kill switch for voice by environment, surface, and domain.
- No booking tools until safety is proven.

## 5. Required Before Customer/Public Exposure

- Explicit `customer_safe` and `public_marketing_safe` pack metadata.
- Surface-safe wording that excludes professional mechanical methods.
- No professional repair, adjustment, bypass, code, AHJ, legal, or manufacturer-specific guidance.
- Customer portal and public-site QA traps passing with no leakage.
- Legal/AHJ fallback tested for unsupported jurisdiction, unknown municipality, permit, compliance, and manufacturer claims.

## 6. Release Recommendation

Overall recommendation: **CONDITIONAL GO for limited professional internal text pilot, gas-fireplace only.**

Explicit restrictions:

- **NO-GO for AI Voice/live booking.**
- **NO-GO for customer/public surfaces.**
- **NO-GO for all-trades rollout.**

Conditions for the limited internal text pilot:

- Keep runtime gates and path guard enabled.
- Keep candidate/protocol/runtime docs blocked.
- Limit to approved professional users with active organization context.
- Monitor fallback and refusal telemetry.
- Re-run the appendix and adversarial checks before expanding beyond gas-fireplace professional text usage.
