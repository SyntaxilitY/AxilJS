/**
 * Post Model — Blog posts
 */
export interface Post {
    id: number;
    title: string;
    slug: string;
    content: string;
    excerpt: string;
    authorId: number;
    tags: string[];
    published: boolean;
    views: number;
    createdAt: string;
    updatedAt: string;
}
export declare const PostModel: {
    create(data: {
        title: string;
        content: string;
        authorId: number;
        tags?: string[];
    }): Post;
    findById(id: number): Post | null;
    findBySlug(slug: string): Post | null;
    findAll(options?: {
        authorId?: number;
        published?: boolean;
        tag?: string;
        page?: number;
        perPage?: number;
    }): {
        data: Post[];
        total: number;
        page: number;
        perPage: number;
        totalPages: number;
    };
    update(id: number, data: Partial<Pick<Post, 'title' | 'content' | 'tags' | 'published'>>): Post | null;
    incrementViews(id: number): void;
    delete(id: number): boolean;
};
//# sourceMappingURL=Post.d.ts.map