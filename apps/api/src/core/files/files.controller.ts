import { Controller, Get, Param, Post, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Access, Authenticated, Req } from "../access/decorators.js";
import type { AccessContext } from "../access/access.types.js";
import { badRequest } from "../errors.js";
import { FileService, MAX_FILE_BYTES } from "./file.service.js";

@Controller("files")
export class FilesController {
  constructor(private readonly files: FileService) {}

  @Post()
  @Authenticated()
  async upload(@Access() ctx: AccessContext, @Req() req: FastifyRequest) {
    if (!req.isMultipart()) throw badRequest("multipart/form-data required");
    const part = await req.file({ limits: { fileSize: MAX_FILE_BYTES } });
    if (!part) throw badRequest("file field missing");
    const data = await part.toBuffer();
    return this.files.save(ctx, { filename: part.filename, contentType: part.mimetype, data });
  }

  @Get(":id")
  @Authenticated()
  async download(@Param("id") id: string, @Res() reply: FastifyReply) {
    const file = await this.files.read(id);
    await reply
      .header("content-type", file.contentType)
      .header("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
      .send(file.data);
  }
}
