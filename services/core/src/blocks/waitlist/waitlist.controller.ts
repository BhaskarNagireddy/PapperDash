import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { JoinWaitlistInput, LeaveWaitlistInput } from '@papperdash/contracts';
import type { Request } from 'express';
import type { z } from 'zod';
import { ZodPipe } from '../../platform/validation.js';
import { WaitlistService } from './waitlist.service.js';

@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Post()
  @HttpCode(202)
  async join(@Body(new ZodPipe(JoinWaitlistInput)) body: JoinWaitlistInput, @Req() req: Request) {
    await this.waitlist.join(body, req.ip ?? 'unknown');
    return { message: 'You are on the waitlist. We have sent you a confirmation email.' };
  }

  @Post('leave')
  @HttpCode(204)
  async leave(@Body(new ZodPipe(LeaveWaitlistInput)) body: z.infer<typeof LeaveWaitlistInput>) {
    await this.waitlist.leave(body.token);
  }
}
