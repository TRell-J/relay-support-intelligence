/**
 * Public surface of the domain model.
 *
 * Everything outside `src/domain` imports types from here, never from the
 * individual modules, so the internal file layout stays free to change.
 */
export * from './core';
export * from './entities';
export * from './events';
export type {
  AgentId,
  AnswerId,
  ArticleId,
  CaseEventId,
  CaseId,
  ClusterId,
  ConversationId,
  EmployeeId,
  IssueId,
  MessageId,
  OpportunityId,
  UpdateId,
} from '../ids';
export type { Iso } from '../clock';
