import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { type CustomTopic, TopicInput, type TopicList } from '@speakai/contracts';
import { CurrentUser, type SessionUser } from '../auth/auth.decorators.js';
import { parseBody } from '../common/problem.js';
import { TopicsService } from './topics.service.js';

/** The user's own practice topics. A topic's id is a scenario id: start a call with POST /conversations. */
@Controller('topics')
export class TopicsController {
  constructor(private readonly topics: TopicsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser): Promise<TopicList> {
    return this.topics.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<CustomTopic> {
    return this.topics.create(user.id, parseBody(TopicInput, body));
  }

  @Put(':id')
  update(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: unknown): Promise<CustomTopic> {
    return this.topics.update(user.id, id, parseBody(TopicInput, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<void> {
    return this.topics.remove(user.id, id);
  }
}
