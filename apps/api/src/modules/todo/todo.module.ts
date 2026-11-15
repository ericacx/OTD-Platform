import { Body, Controller, Get, Global, HttpCode, Module, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { todoCreateSchema } from "@otd/contracts/todo";
import type { z } from "zod";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { TodoOverviewService } from "./overview.service.js";
import { TodoService } from "./todo.service.js";

@Controller("todos")
export class TodoController {
  constructor(
    private readonly service: TodoService,
    private readonly overviewService: TodoOverviewService,
  ) {}

  @Get("overview")
  @Permission("todo.todo.view")
  overview(@Access() ctx: AccessContext) {
    return this.overviewService.overview(ctx);
  }

  @Get("board")
  @Permission("todo.todo.view")
  board(@Access() ctx: AccessContext) {
    return this.service.board(ctx);
  }

  @Post()
  @Permission("todo.todo.view")
  create(@Access() ctx: AccessContext, @Body(zod(todoCreateSchema)) body: z.infer<typeof todoCreateSchema>) {
    return this.service.createManual(ctx, body);
  }

  @Post(":id/done")
  @HttpCode(200)
  @Permission("todo.todo.view")
  async done(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.service.complete(ctx, id);
    return null;
  }
}

@Global()
@Module({
  controllers: [TodoController],
  providers: [TodoService, TodoOverviewService],
  exports: [TodoService, TodoOverviewService],
})
export class TodoModule {}
