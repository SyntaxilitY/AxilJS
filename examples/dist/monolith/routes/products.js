"use strict";
/**
 * Product Routes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerProductRoutes = registerProductRoutes;
const core_1 = require("@axiljs/core");
const auth_1 = require("@axiljs/auth");
const validation_1 = require("@axiljs/validation");
const ProductService_1 = require("../services/ProductService");
function registerProductRoutes(app, jwt) {
    const products = new ProductService_1.ProductService();
    const authMw = (0, auth_1.authenticate)(jwt);
    const adminMw = (0, auth_1.requireRole)('admin');
    // GET /api/products — public
    app.get('/api/products', async (req, res) => {
        const { page, limit } = core_1.Response.getPaginationParams(req);
        const category = req.query.category;
        const result = await products.list({ page, limit, category });
        res.paginated(result.data, result.total, result.page, result.limit, 'Products fetched');
    });
    // GET /api/products/:id — public
    app.get('/api/products/:id', async (req, res) => {
        const product = await products.findById(Number(req.params.id));
        if (!product)
            return res.notFound('Product not found');
        res.success(product, 'Product fetched');
    });
    // POST /api/products — admin only
    app.post('/api/products', authMw, adminMw, (0, validation_1.validate)({
        body: validation_1.v.object({
            name: validation_1.v.string().min(2).max(200),
            description: validation_1.v.string().max(2000).optional(),
            price: validation_1.v.number().min(0),
            stock: validation_1.v.number().min(0).integer(),
            category: validation_1.v.string().max(100).optional()
        })
    }), async (req, res) => {
        const product = await products.create(req.body);
        res.created(product, 'Product created');
    });
    // PUT /api/products/:id — admin only
    app.put('/api/products/:id', authMw, adminMw, (0, validation_1.validate)({
        body: validation_1.v.object({
            name: validation_1.v.string().min(2).max(200).optional(),
            description: validation_1.v.string().max(2000).optional(),
            price: validation_1.v.number().min(0).optional(),
            stock: validation_1.v.number().min(0).integer().optional(),
            category: validation_1.v.string().max(100).optional()
        })
    }), async (req, res) => {
        const product = await products.update(Number(req.params.id), req.body);
        if (!product)
            return res.notFound('Product not found');
        res.success(product, 'Product updated');
    });
    // DELETE /api/products/:id — admin only (soft delete)
    app.delete('/api/products/:id', authMw, adminMw, async (req, res) => {
        const deleted = await products.delete(Number(req.params.id));
        if (!deleted)
            return res.notFound('Product not found');
        res.success(null, 'Product deleted');
    });
}
//# sourceMappingURL=products.js.map