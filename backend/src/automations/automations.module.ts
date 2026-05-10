import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { AutomationRuleEntity } from "../database/entities/automation-rule.entity";
import { AutomationSettingEntity } from "../database/entities/automation-setting.entity";
import { AutomationTemplateEntity } from "../database/entities/automation-template.entity";
import { AutomationAuditService } from "./automation-audit.service";
import { AutomationEventDispatcherService } from "./automation-event-dispatcher.service";
import { AutomationEvaluatorService } from "./automation-evaluator.service";
import { AutomationExecutorService } from "./automation-executor.service";
import { AutomationSchedulerService } from "./automation-scheduler.service";
import { AutomationTemplateRendererService } from "./automation-template-renderer.service";
import { AutomationsController } from "./automations.controller";
import { AutomationsService } from "./automations.service";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      AutomationTemplateEntity,
      AutomationRuleEntity,
      AutomationSettingEntity,
    ]),
  ],
  controllers: [AutomationsController],
  providers: [
    AutomationAuditService,
    AutomationEventDispatcherService,
    AutomationEvaluatorService,
    AutomationExecutorService,
    AutomationSchedulerService,
    AutomationTemplateRendererService,
    AutomationsService,
  ],
  exports: [AutomationEventDispatcherService],
})
export class AutomationsModule {}
