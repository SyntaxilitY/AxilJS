/**
 * Phase 4 examples — Event decorators
 */

import { EventBus, OnEvent, registerEventHandlers } from '@restjs/events';
import { REstEvent } from '@restjs/events';

// ─── Create event bus ─────────────────────────────────────────────────────────

const bus = new EventBus();

// ─── Service using @OnEvent decorator ────────────────────────────────────────

class NotificationService {

  // No TypeScript issues with the updated decorator signature
  @OnEvent('user.created')
  async onUserCreated(event: REstEvent<any>): Promise<void> {
    console.log('User created:', event.payload);
  }

  @OnEvent('order.*')
  async onAnyOrder(event: REstEvent<any>): Promise<void> {
    console.log('Order event:', event.type, event.payload);
  }
}

// ─── Register handlers ────────────────────────────────────────────────────────

const service = new NotificationService();
registerEventHandlers(service, bus);

// ─── Test ─────────────────────────────────────────────────────────────────────

async function main() {
  await bus.emit('user.created', { id: 1, name: 'Tariq' });
  await bus.emit('order.placed', { orderId: 'ORD-001' });
  await bus.emit('order.shipped', { orderId: 'ORD-001' });
}

main().catch(console.error);