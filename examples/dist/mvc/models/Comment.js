"use strict";
/**
 * Comment Model — Comments on posts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentModel = void 0;
let sequence = 1;
const store = [];
exports.CommentModel = {
    create(data) {
        const comment = {
            id: sequence++,
            ...data,
            createdAt: new Date().toISOString()
        };
        store.push(comment);
        return comment;
    },
    findByPostId(postId) {
        return store.filter(c => c.postId === postId);
    },
    findById(id) {
        return store.find(c => c.id === id) || null;
    },
    delete(id) {
        const index = store.findIndex(c => c.id === id);
        if (index === -1)
            return false;
        store.splice(index, 1);
        return true;
    },
    // Delete all comments for a post (used when post is deleted)
    deleteByPostId(postId) {
        const before = store.length;
        const keep = store.filter(c => c.postId !== postId);
        store.splice(0, store.length, ...keep);
        return before - store.length;
    }
};
//# sourceMappingURL=Comment.js.map