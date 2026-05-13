-- =============================================================================
-- Gate 12 — DEV/TEST fixture bootstrap (3-org topology + minimal CRM + portal)
-- =============================================================================
-- Target: execute this script against the active application database explicitly.
-- Current local/dev detection (2026-05-13): phoenix_crm_rebase_run_20260512
-- Run as a MySQL user with INSERT/UPDATE on these tables.
-- Password for both fixture users: Gate12Test!2026
-- Includes: orgs, users, memberships, customers, leads, jobs, quotes, invoices, portal_magic_links.
-- Re-run safety: DELETE fixture rows in reverse FK order if emails already exist.
--
-- Raw portal tokens (for /access/<token> manual tests):
--   Valid:   gate12-portal-test-token
--   Expired: gate12-portal-expired-token
-- =============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

-- Organizations (A, B active; C active for User2; D inactive for booking negative)
INSERT INTO `organizations` (`id`, `name`, `slug`, `is_active`, `created_at`, `updated_at`) VALUES
  ('c1111111-1111-4111-8111-0000000000a1', 'Gate 12 Org A', 'g12-or-a', 1, NOW(6), NOW(6)),
  ('c1111111-1111-4111-8111-0000000000b1', 'Gate 12 Org B', 'g12-or-b', 1, NOW(6), NOW(6)),
  ('c1111111-1111-4111-8111-0000000000c1', 'Gate 12 Org C', 'g12-or-c', 1, NOW(6), NOW(6)),
  ('c1111111-1111-4111-8111-0000000000d1', 'Gate 12 Org Inactive', 'g12-or-inactive', 0, NOW(6), NOW(6))
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `is_active` = VALUES(`is_active`), `updated_at` = NOW(6);

-- Users (bcrypt hash for password Gate12Test!2026 — generated with bcrypt cost 10)
INSERT INTO `users` (`id`, `email`, `password_hash`, `is_active`, `created_at`, `updated_at`) VALUES
  ('c2222222-2222-4222-8222-000000000001', 'gate12-user1@fixture.local', '$2b$10$ehIV6OYdF.W/d8S8omQj6eVfQDI96EqEnuoR/u8VnTl5n4Prnv2Ei', 1, NOW(6), NOW(6)),
  ('c2222222-2222-4222-8222-000000000002', 'gate12-user2@fixture.local', '$2b$10$ehIV6OYdF.W/d8S8omQj6eVfQDI96EqEnuoR/u8VnTl5n4Prnv2Ei', 1, NOW(6), NOW(6))
ON DUPLICATE KEY UPDATE `password_hash` = VALUES(`password_hash`), `is_active` = 1, `updated_at` = NOW(6);

INSERT INTO `profiles` (`id`, `auth_user_id`, `full_name`, `phone`, `role`, `created_at`, `updated_at`) VALUES
  ('c3333333-3333-4333-8333-000000000001', 'c2222222-2222-4222-8222-000000000001', 'Gate 12 User One', NULL, 'owner', NOW(6), NOW(6)),
  ('c3333333-3333-4333-8333-000000000002', 'c2222222-2222-4222-8222-000000000002', 'Gate 12 User Two', NULL, 'owner', NOW(6), NOW(6))
ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`), `role` = VALUES(`role`), `updated_at` = NOW(6);

INSERT INTO `memberships` (`id`, `user_id`, `organization_id`, `role`, `status`, `created_at`, `updated_at`) VALUES
  ('c4444444-4444-4444-8444-000000000001', 'c2222222-2222-4222-8222-000000000001', 'c1111111-1111-4111-8111-0000000000a1', 'owner', 'active', NOW(6), NOW(6)),
  ('c4444444-4444-4444-8444-000000000002', 'c2222222-2222-4222-8222-000000000001', 'c1111111-1111-4111-8111-0000000000b1', 'owner', 'active', NOW(6), NOW(6)),
  ('c4444444-4444-4444-8444-000000000003', 'c2222222-2222-4222-8222-000000000002', 'c1111111-1111-4111-8111-0000000000c1', 'owner', 'active', NOW(6), NOW(6))
ON DUPLICATE KEY UPDATE `status` = 'active', `updated_at` = NOW(6);

-- Customers (one per org for portal + search markers in name)
INSERT INTO `customers` (
  `id`, `organization_id`, `full_name`, `email`, `company_name`,
  `service_address_line_1`, `service_address_line_2`, `service_city`, `service_state_or_region`, `service_postal_code`,
  `phone`, `source`, `preferred_service_type`, `notes`, `created_at`, `updated_at`
) VALUES
  ('c9000001-9001-4001-8001-000000000001', 'c1111111-1111-4111-8111-0000000000a1',
    'G12-SEARCH-A-marker', 'g12-cust-a@fixture.local', NULL,
    '1 Fixture Ave', NULL, 'Testville', 'TS', '00001',
    '5550000001', 'website', 'inspection', NULL, NOW(6), NOW(6)),
  ('c9000001-9001-4001-8001-000000000002', 'c1111111-1111-4111-8111-0000000000b1',
    'G12-SEARCH-B-marker', 'g12-cust-b@fixture.local', NULL,
    '2 Fixture Ave', NULL, 'Testville', 'TS', '00002',
    '5550000002', 'website', 'inspection', NULL, NOW(6), NOW(6)),
  ('c9000001-9001-4001-8001-000000000003', 'c1111111-1111-4111-8111-0000000000c1',
    'G12-SEARCH-C-marker', 'g12-cust-c@fixture.local', NULL,
    '3 Fixture Ave', NULL, 'Testville', 'TS', '00003',
    '5550000003', 'website', 'inspection', NULL, NOW(6), NOW(6))
ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`), `updated_at` = NOW(6);

-- Leads (minimal rows for list / foreign-id probes)
INSERT INTO `leads` (
  `id`, `organization_id`, `full_name`, `phone`, `email`,
  `service_address_line_1`, `service_address_line_2`, `service_city`, `service_state_or_region`, `service_postal_code`,
  `source`, `service_type`, `description`, `status`, `converted_job_id`, `created_by_auth_user_id`, `created_at`, `updated_at`
) VALUES
  ('c7000001-7001-4001-8001-000000000001', 'c1111111-1111-4111-8111-0000000000a1', 'G12 Lead A', '5550000101', NULL,
    '10 Lead St', NULL, 'Testville', 'TS', '00001', 'website', 'inspection', NULL, 'new_lead', NULL, NULL, NOW(6), NOW(6)),
  ('c7000001-7001-4001-8001-000000000002', 'c1111111-1111-4111-8111-0000000000b1', 'G12 Lead B', '5550000102', NULL,
    '11 Lead St', NULL, 'Testville', 'TS', '00002', 'website', 'inspection', NULL, 'new_lead', NULL, NULL, NOW(6), NOW(6)),
  ('c7000001-7001-4001-8001-000000000003', 'c1111111-1111-4111-8111-0000000000c1', 'G12 Lead C', '5550000103', NULL,
    '12 Lead St', NULL, 'Testville', 'TS', '00003', 'website', 'inspection', NULL, 'new_lead', NULL, NULL, NOW(6), NOW(6))
ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`), `updated_at` = NOW(6);

-- Jobs + quotes + invoices (one chain per org for matrix C foreign-id probes)
INSERT INTO `jobs` (
  `id`, `organization_id`, `customer_id`, `service_id`, `assigned_technician_id`,
  `title`, `description`, `lead_source`, `requested_service_type`, `status`,
  `service_address_line_1`, `service_address_line_2`, `service_city`, `service_state_or_region`, `service_postal_code`,
  `scheduled_for`, `scheduled_window`, `requested_at`, `on_the_way_at`, `started_at`, `completed_at`, `paid_at`,
  `cancellation_reason`, `cancelled_at`, `cancelled_by`, `created_by_auth_user_id`, `updated_by_auth_user_id`,
  `created_at`, `updated_at`
) VALUES
  (
    'c5000001-5001-4001-8001-000000000001', 'c1111111-1111-4111-8111-0000000000a1', 'c9000001-9001-4001-8001-000000000001',
    NULL, NULL, 'G12 Job A', NULL, 'website', 'inspection', 'scheduled',
    '1 Fixture Ave', NULL, 'Testville', 'TS', '00001',
    NULL, NULL, NOW(6), NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NOW(6), NOW(6)
  ),
  (
    'c5000001-5001-4001-8001-000000000002', 'c1111111-1111-4111-8111-0000000000b1', 'c9000001-9001-4001-8001-000000000002',
    NULL, NULL, 'G12 Job B', NULL, 'website', 'inspection', 'scheduled',
    '2 Fixture Ave', NULL, 'Testville', 'TS', '00002',
    NULL, NULL, NOW(6), NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NOW(6), NOW(6)
  ),
  (
    'c5000001-5001-4001-8001-000000000003', 'c1111111-1111-4111-8111-0000000000c1', 'c9000001-9001-4001-8001-000000000003',
    NULL, NULL, 'G12 Job C', NULL, 'website', 'inspection', 'scheduled',
    '3 Fixture Ave', NULL, 'Testville', 'TS', '00003',
    NULL, NULL, NOW(6), NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NOW(6), NOW(6)
  )
ON DUPLICATE KEY UPDATE `title` = VALUES(`title`), `updated_at` = NOW(6);

INSERT INTO `quotes` (
  `id`, `job_id`, `organization_id`, `description`, `price_cents`, `subtotal_cents`, `tax_rate_bps_snapshot`, `tax_cents`, `total_cents`,
  `status`, `sent_at`, `approved_at`, `approval_requested_at`, `signature_requested_at`, `signed_at`, `signed_by_name`, `created_at`, `updated_at`
) VALUES
  (
    'c6000001-6001-4001-8001-000000000001', 'c5000001-5001-4001-8001-000000000001', 'c1111111-1111-4111-8111-0000000000a1',
    'G12 Quote A', 10000, 10000, 0, 0, 10000, 'draft',
    NULL, NULL, NULL, NULL, NULL, NULL, NOW(6), NOW(6)
  ),
  (
    'c6000001-6001-4001-8001-000000000002', 'c5000001-5001-4001-8001-000000000002', 'c1111111-1111-4111-8111-0000000000b1',
    'G12 Quote B', 20000, 20000, 0, 0, 20000, 'draft',
    NULL, NULL, NULL, NULL, NULL, NULL, NOW(6), NOW(6)
  ),
  (
    'c6000001-6001-4001-8001-000000000003', 'c5000001-5001-4001-8001-000000000003', 'c1111111-1111-4111-8111-0000000000c1',
    'G12 Quote C', 30000, 30000, 0, 0, 30000, 'draft',
    NULL, NULL, NULL, NULL, NULL, NULL, NOW(6), NOW(6)
  )
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`), `updated_at` = NOW(6);

INSERT INTO `invoices` (
  `id`, `job_id`, `organization_id`, `description`, `amount_cents`, `subtotal_cents`, `tax_rate_bps_snapshot`, `tax_cents`, `total_cents`,
  `status`, `issued_at`, `paid_at`, `approval_requested_at`, `approved_at`, `signature_requested_at`, `signed_at`, `signed_by_name`, `created_at`, `updated_at`
) VALUES
  (
    'c6100001-6101-4001-8001-000000000001', 'c5000001-5001-4001-8001-000000000001', 'c1111111-1111-4111-8111-0000000000a1',
    'G12 Invoice A', 10000, 10000, 0, 0, 10000, 'unpaid', NOW(6),
    NULL, NULL, NULL, NULL, NULL, NULL, NOW(6), NOW(6)
  ),
  (
    'c6100001-6101-4001-8001-000000000002', 'c5000001-5001-4001-8001-000000000002', 'c1111111-1111-4111-8111-0000000000b1',
    'G12 Invoice B', 20000, 20000, 0, 0, 20000, 'unpaid', NOW(6),
    NULL, NULL, NULL, NULL, NULL, NULL, NOW(6), NOW(6)
  ),
  (
    'c6100001-6101-4001-8001-000000000003', 'c5000001-5001-4001-8001-000000000003', 'c1111111-1111-4111-8111-0000000000c1',
    'G12 Invoice C', 30000, 30000, 0, 0, 30000, 'unpaid', NOW(6),
    NULL, NULL, NULL, NULL, NULL, NULL, NOW(6), NOW(6)
  )
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`), `updated_at` = NOW(6);

-- Portal magic links (token_hash = SHA-256 hex of raw token; see CustomerPortalService.hashToken)
INSERT INTO `portal_magic_links` (
  `id`, `organization_id`, `customer_id`, `token_hash`, `status`, `delivery_method`,
  `sender_user_id`, `expires_at`, `sent_at`, `opened_at`, `used_at`, `target_job_id`, `target_quote_id`, `created_at`, `updated_at`
) VALUES
  (
    'c8000001-8001-4001-8001-000000000001',
    'c1111111-1111-4111-8111-0000000000a1',
    'c9000001-9001-4001-8001-000000000001',
    'a83bf6f2b39147a2cdd7437685031ae360411b99f880086f853bea20c3743e3f',
    'sent', 'copy', NULL,
    DATE_ADD(NOW(6), INTERVAL 7 DAY), NOW(6), NULL, NULL, NULL, NULL,
    NOW(6), NOW(6)
  ),
  (
    'c8000001-8001-4001-8001-000000000002',
    'c1111111-1111-4111-8111-0000000000a1',
    'c9000001-9001-4001-8001-000000000001',
    'e2216474882a0215aba26a579deb75d5a13279583e4dd0f3892934a89e6f9373',
    'expired', 'copy', NULL,
    DATE_SUB(NOW(6), INTERVAL 1 DAY), NOW(6), NULL, NULL, NULL, NULL,
    NOW(6), NOW(6)
  )
ON DUPLICATE KEY UPDATE `expires_at` = VALUES(`expires_at`), `status` = VALUES(`status`), `updated_at` = NOW(6);

COMMIT;

-- =============================================================================
-- After run: record in docs/gate-12-verification-log.md fixture table:
--   Target DB used at execution time: choose the active app DB explicitly
--     (current local/dev detection 2026-05-13: phoenix_crm_rebase_run_20260512)
--   User1 email: gate12-user1@fixture.local  /  password: Gate12Test!2026
--   User2 email: gate12-user2@fixture.local  /  password: Gate12Test!2026
--   Org A id: c1111111-1111-4111-8111-0000000000a1  slug (booking): g12-or-a
--   Org B id: c1111111-1111-4111-8111-0000000000b1  slug: g12-or-b
--   Org C id: c1111111-1111-4111-8111-0000000000c1  slug: g12-or-c  (forbidden switch target)
--   Inactive org slug: g12-or-inactive
--   Job ids: c5000001-5001-4001-8001-000000000001 (A), …000002 (B), …000003 (C)
--   Quote ids: c6000001-6001-4001-8001-000000000001 (A), …000002 (B), …000003 (C)
--   Invoice ids: c6100001-6101-4001-8001-000000000001 (A), …000002 (B), …000003 (C)
--   Portal valid URL path token: gate12-portal-test-token
--   Portal expired raw token: gate12-portal-expired-token
-- =============================================================================
