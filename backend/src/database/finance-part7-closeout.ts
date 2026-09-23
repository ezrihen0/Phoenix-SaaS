import { execSync } from "node:child_process";

const steps = [
  "npm run build",
  "npm run finance-part6:checks",
  "npm run finance-endpoint-tenant:check",
  "npm run finance-org-isolation:smoke",
  "npm run crm:invoice-payment-recording:smoke",
];

const failures: string[] = [];

for (const step of steps) {
  try {
    console.log(`\n=== ${step} ===`);
    execSync(step, { stdio: "inherit", cwd: process.cwd(), env: process.env });
  } catch {
    failures.push(step);
  }
}

if (failures.length) {
  console.error("\nfinance-part7:closeout failed steps:", failures.join(", "));
  process.exit(1);
}

console.log("\nfinance-part7:closeout PASS");
