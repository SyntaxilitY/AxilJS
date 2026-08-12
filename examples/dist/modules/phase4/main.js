"use strict";
/**
 * Phase 4 examples — Event decorators
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("@restjs/events");
// ─── Create event bus ─────────────────────────────────────────────────────────
const bus = new events_1.EventBus();
// ─── Service using @OnEvent decorator ────────────────────────────────────────
class NotificationService {
    // No TypeScript issues with the updated decorator signature
    async onUserCreated(event) {
        console.log('User created:', event.payload);
    }
    async onAnyOrder(event) {
        console.log('Order event:', event.type, event.payload);
    }
}
__decorate([
    (0, events_1.OnEvent)('user.created')
], NotificationService.prototype, "onUserCreated", null);
__decorate([
    (0, events_1.OnEvent)('order.*')
], NotificationService.prototype, "onAnyOrder", null);
// ─── Register handlers ────────────────────────────────────────────────────────
const service = new NotificationService();
(0, events_1.registerEventHandlers)(service, bus);
// ─── Test ─────────────────────────────────────────────────────────────────────
async function main() {
    await bus.emit('user.created', { id: 1, name: 'Tariq' });
    await bus.emit('order.placed', { orderId: 'ORD-001' });
    await bus.emit('order.shipped', { orderId: 'ORD-001' });
}
main().catch(console.error);
