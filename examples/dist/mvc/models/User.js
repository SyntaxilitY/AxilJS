"use strict";
/**
 * User Model
 * In a real app this would be a database entity via @axiljs/orm.
 * Here we use in-memory store to keep the example self-contained.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserModel = void 0;
// In-memory store
let sequence = 1;
const store = [];
exports.UserModel = {
    // Create a user
    create(data) {
        const user = {
            ...data,
            id: sequence++,
            createdAt: new Date().toISOString()
        };
        store.push(user);
        return user;
    },
    // Find by ID
    findById(id) {
        return store.find(u => u.id === id) || null;
    },
    // Find by email
    findByEmail(email) {
        return store.find(u => u.email === email) || null;
    },
    // Get all (without passwords)
    findAll() {
        return store.map(({ password: _, ...u }) => u);
    },
    // Update
    update(id, data) {
        const index = store.findIndex(u => u.id === id);
        if (index === -1)
            return null;
        store[index] = { ...store[index], ...data };
        return store[index];
    },
    // Delete
    delete(id) {
        const index = store.findIndex(u => u.id === id);
        if (index === -1)
            return false;
        store.splice(index, 1);
        return true;
    },
    // Strip password before returning
    safe(user) {
        const { password: _, ...safe } = user;
        return safe;
    }
};
//# sourceMappingURL=User.js.map