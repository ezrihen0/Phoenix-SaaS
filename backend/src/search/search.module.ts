import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { CustomerEntity } from "../database/entities/customer.entity";
import { JobEntity } from "../database/entities/job.entity";
import { CustomersSearchAdapter } from "./adapters/customers-search.adapter";
import { JobsSearchAdapter } from "./adapters/jobs-search.adapter";
import { OfficeSearchAccessGuard } from "./guards/office-search-access.guard";
import { SearchNormalizer } from "./normalizers/search-normalizer";
import { SearchController } from "./search.controller";
import { SearchDestinationMap } from "./search.destination-map";
import { SearchObservability } from "./search.observability";
import { SearchService } from "./search.service";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([JobEntity, CustomerEntity]),
  ],
  controllers: [SearchController],
  providers: [
    SearchService,
    JobsSearchAdapter,
    CustomersSearchAdapter,
    SearchDestinationMap,
    SearchNormalizer,
    SearchObservability,
    OfficeSearchAccessGuard,
  ],
})
export class SearchModule {}
