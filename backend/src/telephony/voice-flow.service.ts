import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import { VoiceFlowEntity } from "../database/entities/voice-flow.entity";

@Injectable()
export class VoiceFlowService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(VoiceFlowEntity)
    private readonly voiceFlowsRepository: Repository<VoiceFlowEntity>,
  ) {}

  /**
   * Resolve catalog flow for an inbound owned number when `voice_flow_id` is set.
   */
  async findActiveFlowForOwnedPhoneRow(ownedPhoneNumberId: string | null): Promise<VoiceFlowEntity | null> {
    if (!ownedPhoneNumberId?.trim()) {
      return null;
    }

    const rows = (await this.dataSource.query(
      `SELECT voice_flow_id FROM owned_phone_numbers WHERE id = ? LIMIT 1`,
      [ownedPhoneNumberId.trim()],
    )) as Array<{ voice_flow_id: string | null }>;

    const vfId = rows[0]?.voice_flow_id?.trim();
    if (!vfId) {
      return null;
    }

    return this.voiceFlowsRepository.findOne({
      where: { id: vfId, is_active: true },
    });
  }
}
