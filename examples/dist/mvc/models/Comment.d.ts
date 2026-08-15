/**
 * Comment Model — Comments on posts
 */
export interface Comment {
    id: number;
    postId: number;
    authorId: number;
    content: string;
    createdAt: string;
}
export declare const CommentModel: {
    create(data: {
        postId: number;
        authorId: number;
        content: string;
    }): Comment;
    findByPostId(postId: number): Comment[];
    findById(id: number): Comment | null;
    delete(id: number): boolean;
    deleteByPostId(postId: number): number;
};
//# sourceMappingURL=Comment.d.ts.map