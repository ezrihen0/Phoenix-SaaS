import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { CustomerEntity } from "../database/entities/customer.entity";
import { LeadEntity } from "../database/entities/lead.entity";
import { OrganizationEntity } from "../database/entities/organization.entity";
import { ProfileEntity } from "../database/entities/profile.entity";
import { RecentCallEntity } from "../database/entities/recent-call.entity";
import { AiRecommendationRunEntity } from "../database/entities/ai-recommendation-run.entity";
import { VoiceFlowEntity } from "../database/entities/voice-flow.entity";
import { MessagingModule } from "../messaging/messaging.module";
import { CallbackTaskService } from "./callback-task.service";
import { CallReportingController } from "./call-reporting.controller";
import { CallReportingService } from "./call-reporting.service";
import { CallFlowSettingsController } from "./call-flow-settings.controller";
import { CallFlowSettingsService } from "./call-flow-settings.service";
import { CallbackTasksController } from "./callback-tasks.controller";
import { CustomerTextConversationsController } from "./customer-text-conversations.controller";
import { MissedCallSmsSettingsController } from "./missed-call-sms-settings.controller";
import { OutboundDialController } from "./outbound-dial.controller";
import { PhoneNumberRegistryController } from "./phone-number-registry.controller";
import { RecentCallsController } from "./recent-calls.controller";
import { RecentTextsController } from "./recent-texts.controller";
import { LiveVoicePilotService } from "./live-voice-pilot.service";
import { TelnyxLiveVoiceAttachService } from "./telnyx-live-voice-attach.service";
import { TelnyxAiAvailabilityToolService } from "./telnyx-ai-availability-tool.service";
import { TelnyxAiToolController } from "./telnyx-ai-tool.controller";
import { TelnyxConversationIngestService } from "./telnyx-conversation-ingest.service";
import { TelnyxWebhookController } from "./telnyx-webhook.controller";
import { TelephonyExecutionService } from "./telephony-execution.service";
import { TelnyxWebhookService } from "./telnyx-webhook.service";
import { TwilioMessagesWebhookController } from "./twilio-messages-webhook.controller";
import { VoiceFlowService } from "./voice-flow.service";
import { VoiceIntakePostCallService } from "./voice-intake-post-call.service";

@Module({
  imports: [
    AuthModule,
    MessagingModule,
    TypeOrmModule.forFeature([
      RecentCallEntity,
      CustomerEntity,
      LeadEntity,
      ProfileEntity,
      VoiceFlowEntity,
      OrganizationEntity,
      AiRecommendationRunEntity,
    ]),
  ],
  controllers: [
    TelnyxWebhookController,
    TelnyxAiToolController,
    TwilioMessagesWebhookController,
    RecentCallsController,
    RecentTextsController,
    CustomerTextConversationsController,
    MissedCallSmsSettingsController,
    CallReportingController,
    CallFlowSettingsController,
    CallbackTasksController,
    OutboundDialController,
    PhoneNumberRegistryController,
  ],
  providers: [
    TelnyxWebhookService,
    CallbackTaskService,
    CallFlowSettingsService,
    TelephonyExecutionService,
    CallReportingService,
    VoiceFlowService,
    LiveVoicePilotService,
    TelnyxLiveVoiceAttachService,
    TelnyxConversationIngestService,
    TelnyxAiAvailabilityToolService,
    VoiceIntakePostCallService,
  ],
  exports: [
    TelnyxWebhookService,
    CallbackTaskService,
    CallFlowSettingsService,
    TelephonyExecutionService,
    CallReportingService,
    VoiceFlowService,
    LiveVoicePilotService,
    TelnyxLiveVoiceAttachService,
    TelnyxConversationIngestService,
    TelnyxAiAvailabilityToolService,
    VoiceIntakePostCallService,
  ],
})
export class TelephonyModule {}
