import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { TechnicianEntity } from "../database/entities/technician.entity";
import { WebPushSubscriptionEntity } from "../database/entities/web-push-subscription.entity";
import { PushController } from "./push.controller";
import { PushSubscriptionService } from "./push-subscription.service";
import { TechnicianJobPushService } from "./technician-job-push.service";
import { WebPushConfigService } from "./web-push-config.service";
import { WebPushDeliveryService } from "./web-push-delivery.service";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([WebPushSubscriptionEntity, TechnicianEntity]),
  ],
  controllers: [PushController],
  providers: [
    WebPushConfigService,
    WebPushDeliveryService,
    PushSubscriptionService,
    TechnicianJobPushService,
  ],
  exports: [TechnicianJobPushService, WebPushConfigService],
})
export class PushModule {}
