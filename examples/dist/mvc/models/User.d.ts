/**
 * User Model
 * In a real app this would be a database entity via @axiljs/orm.
 * Here we use in-memory store to keep the example self-contained.
 */
export interface User {
    id: number;
    name: string;
    email: string;
    password: string;
    role: 'admin' | 'author' | 'reader';
    bio: string;
    createdAt: string;
}
export declare const UserModel: {
    create(data: Omit<User, 'id' | 'createdAt'>): User;
    findById(id: number): User | null;
    findByEmail(email: string): User | null;
    findAll(): Omit<User, 'password'>[];
    update(id: number, data: Partial<Omit<User, 'id' | 'createdAt'>>): User | null;
    delete(id: number): boolean;
    safe(user: User): Omit<User, 'password'>;
};
//# sourceMappingURL=User.d.ts.map