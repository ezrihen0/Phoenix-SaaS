import { MigrationInterface, QueryRunner } from "typeorm";

const DEFAULT_CALL_FLOW_CONFIG_ID = "00000000-0000-4000-8000-000000000001";
const DEFAULT_MISSED_CALL_SMS_SETTINGS_ID = "00000000-0000-4000-8000-000000000002";

const DEFAULT_BUSINESS_HOURS = [
  { id: "00000000-0000-4000-8000-000000000011", dayKey: "monday", enabled: 1, openTime: "08:00", closeTime: "17:00", sortOrder: 0 },
  { id: "00000000-0000-4000-8000-000000000012", dayKey: "tuesday", enabled: 1, openTime: "08:00", closeTime: "17:00", sortOrder: 1 },
  { id: "00000000-0000-4000-8000-000000000013", dayKey: "wednesday", enabled: 1, openTime: "08:00", closeTime: "17:00", sortOrder: 2 },
  { id: "00000000-0000-4000-8000-000000000014", dayKey: "thursday", enabled: 1, openTime: "08:00", closeTime: "17:00", sortOrder: 3 },
  { id: "00000000-0000-4000-8000-000000000015", dayKey: "friday", enabled: 1, openTime: "08:00", closeTime: "17:00", sortOrder: 4 },
  { id: "00000000-0000-4000-8000-000000000016", dayKey: "saturday", enabled: 1, openTime: "09:00", closeTime: "13:00", sortOrder: 5 },
  { id: "00000000-0000-4000-8000-000000000017", dayKey: "sunday", enabled: 0, openTime: "09:00", closeTime: "13:00", sortOrder: 6 },
] as const;

const DEFAULT_IVR_OPTIONS = [
  {
    id: "00000000-0000-4000-8000-000000000021",
    digit: "1",
    label: "Inspection or cleaning",
    serviceType: "inspection",
    routeTarget: "office-inspection",
    sortOrder: 0,
  },
  {
    id: "00000000-0000-4000-8000-000000000022",
    digit: "2",
    label: "Repair or service",
    serviceType: "repair",
    routeTarget: "office-repair",
    sortOrder: 1,
  },
] as const;

export class RuntimeCommunicationsSchema1778588600000 implements MigrationInterface {
  name = "RuntimeCommunicationsSchema1778588600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`sms_templates\` (
        \`id\` char(36) NOT NULL,
        \`name\` varchar(160) NOT NULL,
        \`body\` text NOT NULL,
        \`is_active\` tinyint(1) NOT NULL DEFAULT 1,
        \`sort_order\` int NOT NULL DEFAULT 0,
        \`quick_pick_order\` int NULL,
        \`created_by_user_id\` varchar(64) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`idx_sms_templates_active_sort\` (\`is_active\`, \`sort_order\`, \`created_at\`),
        KEY \`idx_sms_templates_quick_pick\` (\`is_active\`, \`quick_pick_order\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`call_flow_configs\` (
        \`id\` char(36) NOT NULL,
        \`config_name\` varchar(100) NOT NULL,
        \`is_active\` tinyint(1) NOT NULL DEFAULT 1,
        \`time_zone\` varchar(64) NOT NULL DEFAULT 'America/Edmonton',
        \`greeting_mode\` varchar(32) NOT NULL DEFAULT 'standard_greeting',
        \`greeting_text\` longtext NULL,
        \`open_hours_action\` varchar(64) NOT NULL DEFAULT 'standard_answer',
        \`open_hours_route_target\` varchar(255) NULL,
        \`after_hours_action\` varchar(64) NOT NULL DEFAULT 'voicemail',
        \`after_hours_route_target\` varchar(255) NULL,
        \`whisper_message\` longtext NULL,
        \`missed_call_sms_template_key\` varchar(64) NULL,
        \`updated_by_auth_user_id\` char(36) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`ix_call_flow_configs_is_active\` (\`is_active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`call_flow_business_hours\` (
        \`id\` char(36) NOT NULL,
        \`call_flow_config_id\` char(36) NOT NULL,
        \`day_key\` varchar(16) NOT NULL,
        \`is_enabled\` tinyint(1) NOT NULL DEFAULT 1,
        \`open_time\` varchar(5) NOT NULL,
        \`close_time\` varchar(5) NOT NULL,
        \`sort_order\` int NOT NULL DEFAULT 0,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`ux_call_flow_business_hours_config_day\` (\`call_flow_config_id\`, \`day_key\`),
        KEY \`ix_call_flow_business_hours_sort_order\` (\`call_flow_config_id\`, \`sort_order\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`call_flow_ivr_options\` (
        \`id\` char(36) NOT NULL,
        \`call_flow_config_id\` char(36) NOT NULL,
        \`digit\` varchar(4) NOT NULL,
        \`option_label\` varchar(120) NOT NULL,
        \`service_type\` varchar(64) NULL,
        \`route_target\` varchar(255) NULL,
        \`sort_order\` int NOT NULL DEFAULT 0,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`ux_call_flow_ivr_options_config_digit\` (\`call_flow_config_id\`, \`digit\`),
        KEY \`ix_call_flow_ivr_options_sort_order\` (\`call_flow_config_id\`, \`sort_order\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`callback_tasks\` (
        \`id\` char(36) NOT NULL,
        \`recent_call_id\` char(36) NOT NULL,
        \`client_id\` char(36) NULL,
        \`lead_id\` char(36) NULL,
        \`phone_number\` varchar(64) NULL,
        \`source\` varchar(64) NOT NULL DEFAULT 'unknown',
        \`priority\` varchar(32) NOT NULL DEFAULT 'normal',
        \`due_at\` datetime(6) NULL,
        \`assigned_to_profile_id\` char(36) NULL,
        \`status\` varchar(32) NOT NULL DEFAULT 'open',
        \`notes\` longtext NULL,
        \`created_by_auth_user_id\` char(36) NULL,
        \`completed_at\` datetime(6) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`ix_callback_tasks_recent_call_id\` (\`recent_call_id\`),
        KEY \`ix_callback_tasks_assigned_to_profile_id\` (\`assigned_to_profile_id\`),
        KEY \`ix_callback_tasks_status\` (\`status\`),
        KEY \`ix_callback_tasks_due_at\` (\`due_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`missed_call_sms_settings\` (
        \`id\` char(36) NOT NULL,
        \`settings_key\` varchar(64) NOT NULL,
        \`is_enabled\` tinyint(1) NOT NULL DEFAULT 0,
        \`template\` longtext NOT NULL,
        \`cooldown_seconds\` int NOT NULL DEFAULT 900,
        \`updated_by_auth_user_id\` char(36) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`ux_missed_call_sms_settings_key\` (\`settings_key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`missed_call_sms_cooldowns\` (
        \`phone_number_normalized\` varchar(32) NOT NULL,
        \`next_allowed_at\` datetime(6) NOT NULL,
        \`last_recent_call_id\` char(36) NULL,
        \`last_sms_log_id\` char(36) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`phone_number_normalized\`),
        KEY \`ix_missed_call_sms_cooldowns_next_allowed_at\` (\`next_allowed_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`recent_call_sms_logs\` (
        \`id\` char(36) NOT NULL,
        \`recent_call_id\` char(36) NULL,
        \`customer_id\` char(36) NULL,
        \`phone_number\` varchar(64) NULL,
        \`phone_number_normalized\` varchar(32) NULL,
        \`direction\` varchar(16) NOT NULL DEFAULT 'outbound',
        \`delivery_status\` varchar(64) NOT NULL,
        \`provider\` varchar(64) NOT NULL DEFAULT 'twilio',
        \`provider_message_id\` varchar(255) NULL,
        \`template_body\` longtext NULL,
        \`rendered_message\` longtext NULL,
        \`cooldown_applied\` tinyint(1) NOT NULL DEFAULT 0,
        \`error_code\` varchar(128) NULL,
        \`error_message\` longtext NULL,
        \`sent_at\` datetime(6) NULL,
        \`read_at\` datetime(6) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`ix_recent_call_sms_logs_recent_call_id\` (\`recent_call_id\`),
        KEY \`ix_recent_call_sms_logs_customer_id\` (\`customer_id\`),
        KEY \`ix_recent_call_sms_logs_phone_number_normalized\` (\`phone_number_normalized\`),
        KEY \`ix_recent_call_sms_logs_read_at\` (\`read_at\`),
        KEY \`ix_recent_call_sms_logs_created_at\` (\`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`recent_call_activity_events\` (
        \`id\` char(36) NOT NULL,
        \`recent_call_id\` char(36) NOT NULL,
        \`event_key\` varchar(128) NOT NULL,
        \`metadata_json\` longtext NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`ix_recent_call_activity_events_recent_call_id\` (\`recent_call_id\`),
        KEY \`ix_recent_call_activity_events_event_key\` (\`event_key\`),
        KEY \`ix_recent_call_activity_events_created_at\` (\`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      INSERT INTO \`call_flow_configs\` (
        \`id\`,
        \`config_name\`,
        \`is_active\`,
        \`time_zone\`,
        \`greeting_mode\`,
        \`greeting_text\`,
        \`open_hours_action\`,
        \`open_hours_route_target\`,
        \`after_hours_action\`,
        \`after_hours_route_target\`,
        \`whisper_message\`,
        \`missed_call_sms_template_key\`,
        \`updated_by_auth_user_id\`,
        \`created_at\`,
        \`updated_at\`
      ) VALUES (
        '${DEFAULT_CALL_FLOW_CONFIG_ID}',
        'Phoenix Main Call Flow',
        1,
        'America/Edmonton',
        'standard_greeting',
        NULL,
        'standard_answer',
        'office-main',
        'voicemail',
        'after-hours-voicemail',
        NULL,
        NULL,
        NULL,
        CURRENT_TIMESTAMP(6),
        CURRENT_TIMESTAMP(6)
      )
    `);

    for (const item of DEFAULT_BUSINESS_HOURS) {
      await queryRunner.query(`
        INSERT INTO \`call_flow_business_hours\` (
          \`id\`,
          \`call_flow_config_id\`,
          \`day_key\`,
          \`is_enabled\`,
          \`open_time\`,
          \`close_time\`,
          \`sort_order\`,
          \`created_at\`,
          \`updated_at\`
        ) VALUES (
          '${item.id}',
          '${DEFAULT_CALL_FLOW_CONFIG_ID}',
          '${item.dayKey}',
          ${item.enabled},
          '${item.openTime}',
          '${item.closeTime}',
          ${item.sortOrder},
          CURRENT_TIMESTAMP(6),
          CURRENT_TIMESTAMP(6)
        )
      `);
    }

    for (const item of DEFAULT_IVR_OPTIONS) {
      await queryRunner.query(`
        INSERT INTO \`call_flow_ivr_options\` (
          \`id\`,
          \`call_flow_config_id\`,
          \`digit\`,
          \`option_label\`,
          \`service_type\`,
          \`route_target\`,
          \`sort_order\`,
          \`created_at\`,
          \`updated_at\`
        ) VALUES (
          '${item.id}',
          '${DEFAULT_CALL_FLOW_CONFIG_ID}',
          '${item.digit}',
          '${item.label}',
          ${item.serviceType ? `'${item.serviceType}'` : "NULL"},
          ${item.routeTarget ? `'${item.routeTarget}'` : "NULL"},
          ${item.sortOrder},
          CURRENT_TIMESTAMP(6),
          CURRENT_TIMESTAMP(6)
        )
      `);
    }

    await queryRunner.query(`
      INSERT INTO \`missed_call_sms_settings\` (
        \`id\`,
        \`settings_key\`,
        \`is_enabled\`,
        \`template\`,
        \`cooldown_seconds\`,
        \`updated_by_auth_user_id\`,
        \`created_at\`,
        \`updated_at\`
      ) VALUES (
        '${DEFAULT_MISSED_CALL_SMS_SETTINGS_ID}',
        'default',
        0,
        'Sorry we missed your call to Phoenix Fireplace. Reply to this text or call us back and our office will follow up shortly.',
        900,
        NULL,
        CURRENT_TIMESTAMP(6),
        CURRENT_TIMESTAMP(6)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE `recent_call_activity_events`");
    await queryRunner.query("DROP TABLE `recent_call_sms_logs`");
    await queryRunner.query("DROP TABLE `missed_call_sms_cooldowns`");
    await queryRunner.query("DROP TABLE `missed_call_sms_settings`");
    await queryRunner.query("DROP TABLE `callback_tasks`");
    await queryRunner.query("DROP TABLE `call_flow_ivr_options`");
    await queryRunner.query("DROP TABLE `call_flow_business_hours`");
    await queryRunner.query("DROP TABLE `call_flow_configs`");
    await queryRunner.query("DROP TABLE `sms_templates`");
  }
}
