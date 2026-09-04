import { HttpException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { CustomerEntity } from "../database/entities/customer.entity";
import { JobEntity } from "../database/entities/job.entity";
import { LeadEntity } from "../database/entities/lead.entity";

export type CustomerDeletionFailure = {
  customerId: string;
  message: string;
  code: string;
};

export type CustomerDeletionResult = {
  deleted: string[];
  failed: CustomerDeletionFailure[];
};

@Injectable()
export class CustomerDeletionService {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customersRepository: Repository<CustomerEntity>,
    @InjectRepository(JobEntity)
    private readonly jobsRepository: Repository<JobEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async deleteCustomers(organizationId: string, customerIds: string[]): Promise<CustomerDeletionResult> {
    const uniqueIds = [...new Set(customerIds.map((id) => id.trim()).filter(Boolean))];

    if (uniqueIds.length === 0) {
      apiError(400, "invalid_customer_delete_payload", "Select at least one customer to delete.");
    }

    const deleted: string[] = [];
    const failed: CustomerDeletionFailure[] = [];

    for (const customerId of uniqueIds) {
      try {
        await this.deleteOneCustomer(organizationId, customerId);
        deleted.push(customerId);
      } catch (error) {
        failed.push({
          customerId,
          message: this.extractErrorMessage(error),
          code: this.extractErrorCode(error),
        });
      }
    }

    return { deleted, failed };
  }

  private async deleteOneCustomer(organizationId: string, customerId: string) {
    const customer = await this.customersRepository.findOne({
      where: {
        id: customerId,
        organization_id: organizationId,
      },
    });

    if (!customer) {
      apiError(404, "customer_not_found", "The customer could not be found.");
    }

    const jobCount = await this.jobsRepository.count({
      where: {
        customer_id: customerId,
        organization_id: organizationId,
      },
    });

    if (jobCount > 0) {
      apiError(
        409,
        "customer_has_jobs",
        "Remove linked jobs before deleting this customer.",
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(LeadEntity).update(
        {
          customer_id: customerId,
          organization_id: organizationId,
        },
        { customer_id: null },
      );

      await manager.getRepository(CustomerEntity).delete({
        id: customerId,
        organization_id: organizationId,
      });
    });
  }

  private extractErrorMessage(error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === "object" && response !== null && "error" in response) {
        const payload = response as { error?: { message?: string } };
        if (payload.error?.message) {
          return payload.error.message;
        }
      }
    }

    return error instanceof Error ? error.message : "The customer could not be deleted.";
  }

  private extractErrorCode(error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === "object" && response !== null && "error" in response) {
        const payload = response as { error?: { code?: string } };
        if (payload.error?.code) {
          return payload.error.code;
        }
      }
    }

    return "customer_delete_failed";
  }
}
