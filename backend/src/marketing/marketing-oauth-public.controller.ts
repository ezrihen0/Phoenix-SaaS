import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";

import { MarketingOAuthCallbackService } from "./marketing-oauth-callback.service";

@Controller("api/marketing/oauth")
export class MarketingOAuthPublicController {
  constructor(private readonly oauthCallbacks: MarketingOAuthCallbackService) {}

  @Get("google/callback")
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const target = await this.oauthCallbacks.finishGoogleOAuth(code, state);

    res.redirect(302, target);
  }

  @Get("meta/callback")
  async metaCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const target = await this.oauthCallbacks.finishMetaOAuth(code, state);

    res.redirect(302, target);
  }
}
