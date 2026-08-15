"use strict";
/**
 * Product Service — CRUD with PostgreSQL
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductService = void 0;
const db_1 = require("../db");
class ProductService {
    get driver() { return (0, db_1.getDB)().getDriver(); }
    async list(options) {
        const { page, limit, category } = options;
        const offset = (page - 1) * limit;
        let countQuery = 'SELECT COUNT(*) as total FROM products WHERE active = true';
        let dataQuery = 'SELECT * FROM products WHERE active = true';
        const params = [];
        if (category) {
            countQuery += ` AND category = $1`;
            dataQuery += ` AND category = $1`;
            params.push(category);
        }
        dataQuery += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        const countResult = await this.driver.query(countQuery, params);
        const dataResult = await this.driver.query(dataQuery, [...params, limit, offset]);
        return {
            data: dataResult.rows,
            total: parseInt(countResult.rows[0]?.total || '0', 10),
            page,
            limit
        };
    }
    async findById(id) {
        const result = await this.driver.query('SELECT * FROM products WHERE id = $1 AND active = true', [id]);
        return result.rows[0] || null;
    }
    async create(data) {
        const result = await this.driver.query(`INSERT INTO products (name, description, price, stock, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`, [data.name, data.description || '', data.price, data.stock, data.category || 'general']);
        return result.rows[0];
    }
    async update(id, data) {
        const fields = [];
        const values = [];
        let idx = 1;
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) {
                fields.push(`${key} = $${idx}`);
                values.push(value);
                idx++;
            }
        }
        if (fields.length === 0)
            return null;
        fields.push(`updated_at = NOW()`);
        values.push(id);
        const result = await this.driver.query(`UPDATE products SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
        return result.rows[0] || null;
    }
    async delete(id) {
        const result = await this.driver.query('UPDATE products SET active = false, updated_at = NOW() WHERE id = $1 RETURNING id', [id]);
        return result.rows.length > 0;
    }
}
exports.ProductService = ProductService;
//# sourceMappingURL=ProductService.js.map