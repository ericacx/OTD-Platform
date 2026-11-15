import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { type BoardKey, type BoardQuery, METRIC_DEFINITIONS, boardKeySchema, boardQuerySchema } from "@otd/contracts/metrics";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { DiagnosisService } from "./diagnosis.service.js";
import { MetricsService } from "./metrics.service.js";

const ANY_BOARD = ["metrics.sales.view", "metrics.manager.view", "metrics.gm.view"];

@Controller("metrics")
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly diagnosis: DiagnosisService,
  ) {}

  @Get("definitions")
  @Permission("metrics.definition.view", ...ANY_BOARD)
  definitions() {
    return METRIC_DEFINITIONS;
  }

  @Get("boards/:board")
  @Permission(...ANY_BOARD)
  board(@Access() ctx: AccessContext, @Param("board", zod(boardKeySchema)) board: BoardKey, @Query(zod(boardQuerySchema)) q: BoardQuery) {
    return this.metrics.board(ctx, board, q);
  }

  @Get("boards/:board/diagnosis")
  @Permission(...ANY_BOARD)
  getDiagnosis(@Access() ctx: AccessContext, @Param("board", zod(boardKeySchema)) board: BoardKey, @Query(zod(boardQuerySchema)) q: BoardQuery) {
    return this.diagnosis.get(ctx, board, q);
  }

  @Post("boards/:board/diagnosis/refresh")
  @HttpCode(200)
  @Permission(...ANY_BOARD)
  refreshDiagnosis(@Access() ctx: AccessContext, @Param("board", zod(boardKeySchema)) board: BoardKey, @Query(zod(boardQuerySchema)) q: BoardQuery) {
    return this.diagnosis.get(ctx, board, q, true);
  }
}
