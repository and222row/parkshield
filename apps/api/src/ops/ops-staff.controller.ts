import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../core/zod.pipe';
import { RequirePermission } from './access';
import { CurrentStaff } from './staff.guard';
import { StaffService, type StaffContext } from './staff.service';

const Invite = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(80),
  roles: z.array(z.string().max(32)).min(1).max(7),
});
const Roles = z.object({ roles: z.array(z.string().max(32)).min(1).max(7) });

/** Staff management (staff.manage, superadmin). Every change is audit-logged. */
@Controller('ops/v1/staff')
export class OpsStaffController {
  constructor(@Inject(StaffService) private readonly staff: StaffService) {}

  @Get()
  @RequirePermission('staff.manage')
  async list() {
    return { staff: await this.staff.list(), roles: await this.staff.roles() };
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('staff.manage')
  async invite(
    @CurrentStaff() me: StaffContext,
    @Body(new ZodPipe(Invite)) body: z.infer<typeof Invite>,
  ) {
    const r = await this.staff.invite(me.userId, body);
    // The link is shown once to the inviting admin as well, for hand-over over a second channel.
    return { userId: r.userId, link: r.link };
  }

  @Put(':id/roles')
  @RequirePermission('staff.manage')
  async roles(
    @CurrentStaff() me: StaffContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(Roles)) body: z.infer<typeof Roles>,
  ) {
    await this.staff.setRoles(me, id, body.roles);
    return { ok: true };
  }
}
