import { execSync } from "node:child_process";

const steps = [
  "npm run build",
  "npm run finance-part13:checks",
  "npm run finance-part13:configured-db-verification",
  "npm run portal:isolation:smoke",
  "npm run crm:invoice-payment-recording:smoke",
  "npm run finance-part12:checks",
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
  console.error("\nfinance-part13:closeout failed steps:", failures.join(", "));
  process.exit(1);
}

console.log("\nfinance-part13:closeout PASS");
