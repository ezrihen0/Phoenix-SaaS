const secret = process.env.PHOENIX_INTEGRATION_SECRET || process.env.WIZFIELD_INTEGRATION_SECRET;
console.log(
  JSON.stringify({
    hasPhoenixSecret: Boolean(process.env.PHOENIX_INTEGRATION_SECRET),
    hasWizfieldSecret: Boolean(process.env.WIZFIELD_INTEGRATION_SECRET),
    secretLength: secret ? secret.length : 0,
    orgId: process.env.PHOENIX_INTEGRATION_ORGANIZATION_ID || process.env.PHOENIX_WIZFIELD_ORGANIZATION_ID || "",
  }),
);
