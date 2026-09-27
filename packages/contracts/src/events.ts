/**
 * Envelope for every event a block publishes. Events are written to the outbox in the
 * same transaction as the state change and delivered at least once, so consumers must
 * be idempotent on `id`.
 */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  /** Unique event ID (ULID). Consumers deduplicate on this. */
  id: string;
  type: TType;
  /** Payload schema version. A breaking change publishes a new version alongside the old. */
  version: number;
  /** The entity the event is about, e.g. an order or user ID. */
  aggregateId: string;
  occurredAt: string;
  payload: TPayload;
}
