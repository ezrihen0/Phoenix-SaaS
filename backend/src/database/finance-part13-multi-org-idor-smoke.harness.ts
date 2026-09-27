import { randomUUID } from "crypto";
import { DataSource } from "typeorm";

import type { ActorContext } from "../common/request-types";
import { listPermissionsForMembership } from "../team/membership-permissions";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceDocumentEntity } from "./entities/invoice-document.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoicePaymentEntity } from "./entities/invoice-payment.entity";
import { JobEntity } from "./entities/job.entity";
import { MembershipEntity } from "./entities/membership.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { QuoteEntity } from "./entities/quote.entity";
import { UserEntity } from "./entities/user.entity";

export type FinancePart13Fixture = {
  token: string;
  orgAId: string;
  orgBId: string;
  customerAId: string;
  customerA2Id: string;
  customerBId: string;
  jobAId: string;
  jobBId: string;
  quoteAId: string;
  quoteBId: string;
  invoiceAId: string;
  invoiceBId: string;
  paymentAId: string;
  documentAId: string;
  userId: string;
  profileId: string;
  actorOrgA: ActorContext;
};

function buildActor(input: {
  user: UserEntity;
  profile: ProfileEntity;
  membership: MembershipEntity;
  organizationId: string;
}): ActorContext {
  return {
    user: input.user,
    profile: input.profile,
    technician: null,
    memberships: [input.membership],
    membership: input.membership,
    organization: null,
    membership_id: input.membership.id,
    organization_id: input.organizationId,
    role: input.membership.role,
    permissions: listPermissionsForMembership(input.membership),
    platform_capabilities: [],
  };
}

export async function seedFinancePart13Fixture(dataSource: DataSource): Promise<FinancePart13Fixture> {
  const token = randomUUID().slice(0, 8);
  const orgRepo = dataSource.getRepository(OrganizationEntity);
  const userRepo = dataSource.getRepository(UserEntity);
  const profileRepo = dataSource.getRepository(ProfileEntity);
  const membershipRepo = dataSource.getRepository(MembershipEntity);
  const customerRepo = dataSource.getRepository(CustomerEntity);
  const jobRepo = dataSource.getRepository(JobEntity);
  const quoteRepo = dataSource.getRepository(QuoteEntity);
  const invoiceRepo = dataSource.getRepository(InvoiceEntity);
  const paymentRepo = dataSource.getRepository(InvoicePaymentEntity);
  const documentRepo = dataSource.getRepository(InvoiceDocumentEntity);

  const orgA = await orgRepo.save(
    orgRepo.create({ name: `Finance P13 A ${token}`, slug: `fin-p13-a-${token}`, is_active: true }),
  );
  const orgB = await orgRepo.save(
    orgRepo.create({ name: `Finance P13 B ${token}`, slug: `fin-p13-b-${token}`, is_active: true }),
  );

  const user = await userRepo.save(
    userRepo.create({
      email: `finance-p13-${token}@example.com`,
      password_hash: "smoke-test-password-hash",
      is_active: true,
    }),
  );
  const profile = await profileRepo.save(
    profileRepo.create({
      auth_user_id: user.id,
      full_name: `Finance P13 Owner ${token}`,
      phone: "5551000500",
      role: "owner",
    }),
  );
  const membershipA = await membershipRepo.save(
    membershipRepo.create({
      user_id: user.id,
      organization_id: orgA.id,
      role: "owner",
      status: "active",
    }),
  );

  const customerA = await customerRepo.save(
    customerRepo.create({
      organization_id: orgA.id,
      full_name: `P13 Customer A ${token}`,
      phone: "5551000501",
      email: "p13-a@example.com",
      company_name: null,
      service_address_line_1: "1 P13 Lane",
      service_address_line_2: null,
      service_city: "Calgary",
      service_state_or_region: "AB",
      service_postal_code: "T2P1A1",
      notes: null,
      lifecycle_status: "active",
      preferred_service_type: null,
      source: "website",
    }),
  );
  const customerA2 = await customerRepo.save(
    customerRepo.create({
      organization_id: orgA.id,
      full_name: `P13 Customer A2 ${token}`,
      phone: "5551000503",
      email: "p13-a2@example.com",
      company_name: null,
      service_address_line_1: "3 P13 Lane",
      service_address_line_2: null,
      service_city: "Calgary",
      service_state_or_region: "AB",
      service_postal_code: "T2P1A3",
      notes: null,
      lifecycle_status: "active",
      preferred_service_type: null,
      source: "website",
    }),
  );
  const customerB = await customerRepo.save(
    customerRepo.create({
      organization_id: orgB.id,
      full_name: `P13 Customer B ${token}`,
      phone: "5551000502",
      email: "p13-b@example.com",
      company_name: null,
      service_address_line_1: "2 P13 Lane",
      service_address_line_2: null,
      service_city: "Calgary",
      service_state_or_region: "AB",
      service_postal_code: "T2P1A2",
      notes: null,
      lifecycle_status: "active",
      preferred_service_type: null,
      source: "website",
    }),
  );

  const jobA = await jobRepo.save(
    jobRepo.create({
      organization_id: orgA.id,
      customer_id: customerA.id,
      title: `P13 Job A ${token}`,
      description: "p13 smoke",
      lead_source: "phone",
      requested_service_type: "inspection",
      job_type: "inspection",
      status: "completed",
      service_address_line_1: customerA.service_address_line_1,
      service_address_line_2: null,
      service_city: customerA.service_city,
      service_state_or_region: customerA.service_state_or_region,
      service_postal_code: customerA.service_postal_code,
      scheduled_for: new Date(),
      scheduled_window: "morning",
      requested_at: new Date(),
      completed_at: new Date(),
      created_by_auth_user_id: user.id,
      updated_by_auth_user_id: user.id,
    }),
  );
  const jobB = await jobRepo.save(
    jobRepo.create({
      organization_id: orgB.id,
      customer_id: customerB.id,
      title: `P13 Job B ${token}`,
      description: "p13 smoke b",
      lead_source: "phone",
      requested_service_type: "inspection",
      job_type: "inspection",
      status: "completed",
      service_address_line_1: customerB.service_address_line_1,
      service_address_line_2: null,
      service_city: customerB.service_city,
      service_state_or_region: customerB.service_state_or_region,
      service_postal_code: customerB.service_postal_code,
      scheduled_for: new Date(),
      scheduled_window: "morning",
      requested_at: new Date(),
      completed_at: new Date(),
      created_by_auth_user_id: user.id,
      updated_by_auth_user_id: user.id,
    }),
  );

  const quoteA = await quoteRepo.save(
    quoteRepo.create({
      job_id: jobA.id,
      organization_id: orgA.id,
      description: "P13 estimate A",
      price_cents: 5000,
      subtotal_cents: 5000,
      tax_cents: 0,
      tax_rate_bps_snapshot: 0,
      total_cents: 5000,
      status: "approved",
      sent_at: new Date(),
      approved_at: new Date(),
    }),
  );
  const quoteB = await quoteRepo.save(
    quoteRepo.create({
      job_id: jobB.id,
      organization_id: orgB.id,
      description: "P13 estimate B",
      price_cents: 6000,
      subtotal_cents: 6000,
      tax_cents: 0,
      tax_rate_bps_snapshot: 0,
      total_cents: 6000,
      status: "approved",
      sent_at: new Date(),
      approved_at: new Date(),
    }),
  );

  const invoiceA = await invoiceRepo.save(
    invoiceRepo.create({
      job_id: jobA.id,
      organization_id: orgA.id,
      document_number: "1001",
      description: "P13 invoice A",
      amount_cents: 10_000,
      subtotal_cents: 10_000,
      tax_cents: 0,
      tax_rate_bps_snapshot: 0,
      total_cents: 10_000,
      status: "unpaid",
      issued_at: new Date(),
      due_at: new Date(),
    }),
  );
  const invoiceB = await invoiceRepo.save(
    invoiceRepo.create({
      job_id: jobB.id,
      organization_id: orgB.id,
      document_number: "1001",
      description: "P13 invoice B",
      amount_cents: 20_000,
      subtotal_cents: 20_000,
      tax_cents: 0,
      tax_rate_bps_snapshot: 0,
      total_cents: 20_000,
      status: "unpaid",
      issued_at: new Date(),
      due_at: new Date(),
    }),
  );

  const paymentA = await paymentRepo.save(
    paymentRepo.create({
      organization_id: orgA.id,
      invoice_id: invoiceA.id,
      entry_type: "payment",
      amount_cents: 1000,
      method: "cash",
      reference: null,
      note: null,
      occurred_at: new Date(),
      created_by_auth_user_id: user.id,
    }),
  );

  const documentAId = randomUUID();
  await documentRepo.save(
    documentRepo.create({
      id: documentAId,
      organization_id: orgA.id,
      customer_id: customerA.id,
      invoice_id: invoiceA.id,
      document_kind: "native_customer_pdf",
      generation_sequence: 1,
      storage_key: `${orgA.id}/${invoiceA.id}/${documentAId}.pdf`,
      storage_path: `/tmp/finance-p13-${documentAId}.pdf`,
      file_hash: randomUUID().replace(/-/g, ""),
      original_filename: "invoice-1001.pdf",
      mime_type: "application/pdf",
      import_source: "native_wizfield",
      workiz_invoice_code: null,
    }),
  );

  return {
    token,
    orgAId: orgA.id,
    orgBId: orgB.id,
    customerAId: customerA.id,
    customerA2Id: customerA2.id,
    customerBId: customerB.id,
    jobAId: jobA.id,
    jobBId: jobB.id,
    quoteAId: quoteA.id,
    quoteBId: quoteB.id,
    invoiceAId: invoiceA.id,
    invoiceBId: invoiceB.id,
    paymentAId: paymentA.id,
    documentAId,
    userId: user.id,
    profileId: profile.id,
    actorOrgA: buildActor({ user, profile, membership: membershipA, organizationId: orgA.id }),
  };
}

export async function cleanupFinancePart13Fixture(dataSource: DataSource, fixture: FinancePart13Fixture) {
  await dataSource.getRepository(InvoiceDocumentEntity).delete({ organization_id: fixture.orgAId });
  await dataSource.getRepository(InvoiceDocumentEntity).delete({ organization_id: fixture.orgBId });
  await dataSource.getRepository(InvoicePaymentEntity).delete({ organization_id: fixture.orgAId });
  await dataSource.getRepository(InvoicePaymentEntity).delete({ organization_id: fixture.orgBId });
  await dataSource.getRepository(InvoiceEntity).delete({ id: fixture.invoiceAId });
  await dataSource.getRepository(InvoiceEntity).delete({ id: fixture.invoiceBId });
  await dataSource.getRepository(QuoteEntity).delete({ id: fixture.quoteAId });
  await dataSource.getRepository(QuoteEntity).delete({ id: fixture.quoteBId });
  await dataSource.getRepository(JobEntity).delete({ id: fixture.jobAId });
  await dataSource.getRepository(JobEntity).delete({ id: fixture.jobBId });
  await dataSource.getRepository(CustomerEntity).delete({ id: fixture.customerAId });
  await dataSource.getRepository(CustomerEntity).delete({ id: fixture.customerA2Id });
  await dataSource.getRepository(CustomerEntity).delete({ id: fixture.customerBId });
  await dataSource.getRepository(MembershipEntity).delete({ organization_id: fixture.orgAId });
  await dataSource.getRepository(OrganizationEntity).delete({ id: fixture.orgAId });
  await dataSource.getRepository(OrganizationEntity).delete({ id: fixture.orgBId });
  await dataSource.getRepository(ProfileEntity).delete({ id: fixture.profileId });
  await dataSource.getRepository(UserEntity).delete({ id: fixture.userId });
}
