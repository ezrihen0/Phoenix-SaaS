import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { CrmModule } from "../crm/crm.module";
import { CustomerEntity } from "../database/entities/customer.entity";
import { JobEntity } from "../database/entities/job.entity";
import { AiOperatorDraftEntity } from "../database/entities/ai-operator-draft.entity";
import { MessagingModule } from "../messaging/messaging.module";
import { AiRecommendationRunEntity } from "../database/entities/ai-recommendation-run.entity";
import { OrganizationEntity } from "../database/entities/organization.entity";
import { RecentCallEntity } from "../database/entities/recent-call.entity";
import { AiBrainBriefService } from "./ai-brain-brief.service";
import { AiCallIntakeService } from "./ai-call-intake.service";
import { AiActionTelemetryService } from "./ai-action-telemetry.service";
import { AiActionsService } from "./ai-actions.service";
import { AiAuditService } from "./ai-audit.service";
import { AiCopilotDeepSeekClient } from "./ai-copilot-deepseek-client.service";
import { AiController } from "./ai.controller";
import { AiChatContextService } from "./ai-chat-context.service";
import { AiChatService } from "./ai-chat.service";
import { AiChatSmartOutputEngine } from "./ai-chat-smart-output.engine";
import { AiFieldCopilotService } from "./ai-field-copilot.service";
import { AiFieldJobContextService } from "./ai-field-job-context.service";
import { AiFieldKnowledgeService } from "./ai-field-knowledge.service";
import { AiContextBuilderService } from "./ai-context-builder.service";
import { aiModelInvokerToken } from "./ai-model-invoker";
import { AiDeepSeekProviderService } from "./ai-deepseek-provider.service";
import { AiOperatorCopilotService } from "./ai-operator-copilot.service";
import { AiOrchestrationService } from "./ai-orchestration.service";
import { AiPhase0NoopModelInvoker } from "./ai-phase0-noop-model-invoker";
import { AiToolRegistryService } from "./ai-tool-registry.service";
import { AiUsageService } from "./ai-usage.service";
import { BrainRulesEngine } from "./brain-rules.engine";

@Module({
  imports: [
    AuthModule,
    CrmModule,
    MessagingModule,
    TypeOrmModule.forFeature([
      AiRecommendationRunEntity,
      RecentCallEntity,
      AiOperatorDraftEntity,
      CustomerEntity,
      JobEntity,
      OrganizationEntity,
    ]),
  ],
  controllers: [AiController],
  providers: [
    AiOrchestrationService,
    AiBrainBriefService,
    AiCallIntakeService,
    AiOperatorCopilotService,
    AiDeepSeekProviderService,
    AiCopilotDeepSeekClient,
    AiChatService,
    AiChatContextService,
    AiChatSmartOutputEngine,
    AiFieldKnowledgeService,
    AiFieldJobContextService,
    AiFieldCopilotService,
    AiActionsService,
    AiActionTelemetryService,
    AiUsageService,
    BrainRulesEngine,
    AiToolRegistryService,
    AiAuditService,
    AiContextBuilderService,
    AiPhase0NoopModelInvoker,
    {
      provide: aiModelInvokerToken,
      useExisting: AiPhase0NoopModelInvoker,
    },
  ],
})
export class AiModule {}