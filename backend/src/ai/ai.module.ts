import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { CrmModule } from "../crm/crm.module";
import { CustomerEntity } from "../database/entities/customer.entity";
import { AiOperatorDraftEntity } from "../database/entities/ai-operator-draft.entity";
import { MessagingModule } from "../messaging/messaging.module";
import { AiRecommendationRunEntity } from "../database/entities/ai-recommendation-run.entity";
import { RecentCallEntity } from "../database/entities/recent-call.entity";
import { AiBrainBriefService } from "./ai-brain-brief.service";
import { AiCallIntakeService } from "./ai-call-intake.service";
import { AiAuditService } from "./ai-audit.service";
import { AiCopilotOpenAiClient } from "./ai-copilot-openai-client.service";
import { AiController } from "./ai.controller";
import { AiContextBuilderService } from "./ai-context-builder.service";
import { aiModelInvokerToken } from "./ai-model-invoker";
import { AiOperatorCopilotService } from "./ai-operator-copilot.service";
import { AiOrchestrationService } from "./ai-orchestration.service";
import { AiPhase0NoopModelInvoker } from "./ai-phase0-noop-model-invoker";
import { AiToolRegistryService } from "./ai-tool-registry.service";
import { BrainRulesEngine } from "./brain-rules.engine";

@Module({
  imports: [
    AuthModule,
    CrmModule,
    MessagingModule,
    TypeOrmModule.forFeature([AiRecommendationRunEntity, RecentCallEntity, AiOperatorDraftEntity, CustomerEntity]),
  ],
  controllers: [AiController],
  providers: [
    AiOrchestrationService,
    AiBrainBriefService,
    AiCallIntakeService,
    AiOperatorCopilotService,
    AiCopilotOpenAiClient,
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