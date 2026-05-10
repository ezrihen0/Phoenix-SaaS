import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { CustomerEntity } from "../database/entities/customer.entity";
import { MessagingAccessService } from "./messaging-access.service";
import { MessagingShortLinkController } from "./messaging-short-link.controller";
import { OwnedPhoneNumbersService } from "./phone-numbers/owned-phone-numbers.service";
import { TxtConversationsService } from "./txt/txt-conversations.service";
import { TxtController } from "./txt/txt.controller";
import { TxtMessagesService } from "./txt/txt-messages.service";
import { TxtTemplatesController } from "./txt/txt-templates.controller";
import { TxtTemplatesService } from "./txt/txt-templates.service";
import { TxtService } from "./txt/txt.service";
import { TxtWebhookController } from "./txt/txt-webhook.controller";

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([CustomerEntity])],
  controllers: [MessagingShortLinkController, TxtController, TxtTemplatesController, TxtWebhookController],
  providers: [
    MessagingAccessService,
    TxtService,
    OwnedPhoneNumbersService,
    TxtConversationsService,
    TxtMessagesService,
    TxtTemplatesService,
  ],
  exports: [
    MessagingAccessService,
    TxtService,
    OwnedPhoneNumbersService,
    TxtConversationsService,
    TxtMessagesService,
    TxtTemplatesService,
  ],
})
export class MessagingModule {}
