import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class MarketingSecretsCryptoService {
  constructor(private readonly configService: ConfigService) {}

  private readKeyMaterial(): Buffer {
    const raw = this.configService.get<string>("MARKETING_OAUTH_SECRET_KEY")?.trim();
    if (!raw) {
      throw new Error("MARKETING_OAUTH_SECRET_KEY is not configured.");
    }

    const buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) {
      throw new Error("MARKETING_OAUTH_SECRET_KEY must decode to 32 bytes (AES-256-GCM key).");
    }

    return buf;
  }

  encryptJson(payload: unknown): string {
    const key = this.readKeyMaterial();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const plain = Buffer.from(JSON.stringify(payload), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, ciphertext]).toString("base64");
  }

  decryptJson<T>(blob: string): T {
    const key = this.readKeyMaterial();
    const packed = Buffer.from(blob, "base64");
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const ciphertext = packed.subarray(28);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return JSON.parse(plain.toString("utf8")) as T;
  }
}
