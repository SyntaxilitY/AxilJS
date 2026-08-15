## Testing E-Commerce Monolith with Postman

**Base URL:** `http://localhost:3002`

---

### Step 1 — See all endpoints

```
GET http://localhost:3002/
```

---

### Step 2 — Register Admin

```
POST http://localhost:3002/api/auth/register
Content-Type: application/json

{
  "name": "Admin",
  "email": "admin@shop.com",
  "password": "admin123",
  "role": "admin"
}
```

Expected:

```json
{
  "status": 201,
  "code": "HTTP_201_CREATED",
  "message": "Registration successful",
  "data": {
    "user": {
      "id": 1,
      "name": "Admin",
      "email": "admin@shop.com",
      "role": "admin"
    },
    "token": "eyJ..."
  }
}
```

Copy the admin token.

---

### Step 3 — Register Customer

```
POST http://localhost:3002/api/auth/register
Content-Type: application/json

{
  "name": "Ahmed Khan",
  "email": "ahmed@shop.com",
  "password": "cust1234"
}
```

---

### Step 4 — Login as Admin

```
POST http://localhost:3002/api/auth/login
Content-Type: application/json

{
  "email": "admin@shop.com",
  "password": "admin123"
}
```

Copy admin token.

---

### Step 5 — Get Profile

```
GET http://localhost:3002/api/auth/me
Authorization: Bearer <admin-token>
```

---

### Step 6 — Create Products (Admin only)

**Product 1:**

```
POST http://localhost:3002/api/products
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "name": "AxilJS T-Shirt",
  "description": "Premium developer tee with AxilJS logo",
  "price": 29.99,
  "stock": 100,
  "category": "apparel"
}
```

**Product 2:**

```
POST http://localhost:3002/api/products
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "name": "AxilJS Mug",
  "description": "Ceramic mug for coffee-powered coding",
  "price": 14.99,
  "stock": 50,
  "category": "accessories"
}
```

**Product 3:**

```
POST http://localhost:3002/api/products
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "name": "AxilJS Sticker Pack",
  "description": "10 premium vinyl stickers",
  "price": 4.99,
  "stock": 200,
  "category": "accessories"
}
```

**Product 4:**

```
POST http://localhost:3002/api/products
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "name": "AxilJS Hoodie",
  "description": "Warm hoodie for late night debugging",
  "price": 59.99,
  "stock": 30,
  "category": "apparel"
}
```

---

### Step 7 — List All Products (Public)

```
GET http://localhost:3002/api/products
```

Expected:

```json
{
  "status": 200,
  "code": "HTTP_200_OK",
  "message": "Products fetched",
  "data": {
    "metadata": [
      {
        "id": 4,
        "name": "AxilJS Hoodie",
        "price": "59.99",
        "stock": 30,
        "category": "apparel"
      },
      {
        "id": 3,
        "name": "AxilJS Sticker Pack",
        "price": "4.99",
        "stock": 200,
        "category": "accessories"
      }
    ],
    "pagination": {
      "total": 4,
      "page": 1,
      "limit": 100,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

---

### Step 8 — Filter by Category

```
GET http://localhost:3002/api/products?category=apparel
```

Should return only T-Shirt and Hoodie.

---

### Step 9 — Paginate Products

```
GET http://localhost:3002/api/products?page=1&limit=2
```

Should return 2 products with `hasNextPage: true`.

---

### Step 10 — Get Single Product

```
GET http://localhost:3002/api/products/1
```

---

### Step 11 — Update Product (Admin)

```
PUT http://localhost:3002/api/products/1
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "price": 24.99,
  "stock": 150
}
```

---

### Step 12 — Login as Customer

```
POST http://localhost:3002/api/auth/login
Content-Type: application/json

{
  "email": "ahmed@shop.com",
  "password": "cust1234"
}
```

Copy customer token.

---

### Step 13 — Customer Cannot Create Product

```
POST http://localhost:3002/api/products
Authorization: Bearer <customer-token>
Content-Type: application/json

{
  "name": "Fake Product",
  "price": 9.99,
  "stock": 10
}
```

Expected:

```json
{
  "status": 403,
  "code": "HTTP_403_FORBIDDEN",
  "message": "Access denied. Required role(s): admin. Your role(s): customer"
}
```

---

### Step 14 — View Cart (Empty)

```
GET http://localhost:3002/api/cart
Authorization: Bearer <customer-token>
```

Expected:

```json
{
  "status": 200,
  "code": "HTTP_200_OK",
  "message": "Cart fetched",
  "data": {
    "items": [],
    "total": 0
  }
}
```

---

### Step 15 — Add Items to Cart

**Add 2 T-Shirts:**

```
POST http://localhost:3002/api/cart/add
Authorization: Bearer <customer-token>
Content-Type: application/json

{
  "productId": 1,
  "quantity": 2
}
```

**Add 1 Mug:**

```
POST http://localhost:3002/api/cart/add
Authorization: Bearer <customer-token>
Content-Type: application/json

{
  "productId": 2,
  "quantity": 1
}
```

**Add 3 Sticker Packs:**

```
POST http://localhost:3002/api/cart/add
Authorization: Bearer <customer-token>
Content-Type: application/json

{
  "productId": 3,
  "quantity": 3
}
```

---

### Step 16 — View Cart

```
GET http://localhost:3002/api/cart
Authorization: Bearer <customer-token>
```

Expected:

```json
{
  "status": 200,
  "code": "HTTP_200_OK",
  "message": "Cart fetched",
  "data": {
    "items": [
      {
        "productId": 1,
        "name": "AxilJS T-Shirt",
        "price": 24.99,
        "quantity": 2,
        "subtotal": 49.98
      },
      {
        "productId": 2,
        "name": "AxilJS Mug",
        "price": 14.99,
        "quantity": 1,
        "subtotal": 14.99
      },
      {
        "productId": 3,
        "name": "AxilJS Sticker Pack",
        "price": 4.99,
        "quantity": 3,
        "subtotal": 14.97
      }
    ],
    "total": 79.94
  }
}
```

---

### Step 17 — Remove Item from Cart

```
DELETE http://localhost:3002/api/cart/remove/3
Authorization: Bearer <customer-token>
```

Sticker packs removed. Cart now has T-Shirt + Mug.

---

### Step 18 — Add More of Same Item

```
POST http://localhost:3002/api/cart/add
Authorization: Bearer <customer-token>
Content-Type: application/json

{
  "productId": 1,
  "quantity": 1
}
```

T-Shirt quantity increases from 2 to 3.

---

### Step 19 — Try Adding More Than Stock

```
POST http://localhost:3002/api/cart/add
Authorization: Bearer <customer-token>
Content-Type: application/json

{
  "productId": 4,
  "quantity": 999
}
```

Expected:

```json
{
  "status": 400,
  "code": "HTTP_400_BAD_REQUEST",
  "message": "Only 30 in stock"
}
```

---

### Step 20 — Checkout

```
POST http://localhost:3002/api/orders/checkout
Authorization: Bearer <customer-token>
Content-Type: application/json

{
  "address": "House 42, Street 7, DHA Phase 5, Lahore, Pakistan"
}
```

Expected:

```json
{
  "status": 201,
  "code": "HTTP_201_CREATED",
  "message": "Order placed",
  "data": {
    "id": 1,
    "user_id": 2,
    "status": "pending",
    "total": "89.96",
    "address": "House 42, Street 7, DHA Phase 5, Lahore, Pakistan"
  }
}
```

---

### Step 21 — Cart is Now Empty

```
GET http://localhost:3002/api/cart
Authorization: Bearer <customer-token>
```

Expected:

```json
{
  "data": {
    "items": [],
    "total": 0
  }
}
```

---

### Step 22 — Stock Reduced

```
GET http://localhost:3002/api/products/1
```

T-Shirt stock should be `150 - 3 = 147`.

---

### Step 23 — View Orders (Customer)

```
GET http://localhost:3002/api/orders
Authorization: Bearer <customer-token>
```

Expected:

```json
{
  "status": 200,
  "code": "HTTP_200_OK",
  "message": "Orders fetched",
  "data": {
    "metadata": [
      {
        "id": 1,
        "status": "pending",
        "total": "89.96",
        "address": "House 42, Street 7...",
        "items": [
          {
            "product_name": "AxilJS T-Shirt",
            "quantity": 3,
            "price": "24.99"
          },
          {
            "product_name": "AxilJS Mug",
            "quantity": 1,
            "price": "14.99"
          }
        ]
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 100,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

---

### Step 24 — View Single Order

```
GET http://localhost:3002/api/orders/1
Authorization: Bearer <customer-token>
```

---

### Step 25 — Admin Updates Order Status

```
PATCH http://localhost:3002/api/orders/1/status
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "status": "confirmed"
}
```

Expected:

```json
{
  "status": 200,
  "code": "HTTP_200_OK",
  "message": "Order status updated to confirmed",
  "data": {
    "id": 1,
    "status": "confirmed"
  }
}
```

---

### Step 26 — Ship the Order

```
PATCH http://localhost:3002/api/orders/1/status
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "status": "shipped"
}
```

---

### Step 27 — Deliver the Order

```
PATCH http://localhost:3002/api/orders/1/status
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "status": "delivered"
}
```

---

### Step 28 — Place Another Order

Add items to cart again and checkout:

```
POST http://localhost:3002/api/cart/add
Authorization: Bearer <customer-token>
{ "productId": 4, "quantity": 1 }

POST http://localhost:3002/api/orders/checkout
Authorization: Bearer <customer-token>
{ "address": "Office 301, Johar Town, Lahore" }
```

---

### Step 29 — Cancel an Order

```
PATCH http://localhost:3002/api/orders/2/status
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "status": "cancelled"
}
```

---

### Step 30 — Checkout with Empty Cart

```
POST http://localhost:3002/api/orders/checkout
Authorization: Bearer <customer-token>
Content-Type: application/json

{
  "address": "Some address"
}
```

Expected:

```json
{
  "status": 400,
  "code": "HTTP_400_BAD_REQUEST",
  "message": "Cart is empty"
}
```

---

### Step 31 — Invalid Status Update

```
PATCH http://localhost:3002/api/orders/1/status
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "status": "flying"
}
```

Expected 422 validation error.

---

### Step 32 — Customer Cannot Update Status

```
PATCH http://localhost:3002/api/orders/1/status
Authorization: Bearer <customer-token>
Content-Type: application/json

{
  "status": "delivered"
}
```

Expected 403.

---

### Step 33 — Soft Delete Product (Admin)

```
DELETE http://localhost:3002/api/products/3
Authorization: Bearer <admin-token>
```

Sticker pack is now `active: false`. It will not appear in product listings.

---

### Step 34 — Deleted Product Not in List

```
GET http://localhost:3002/api/products
```

Sticker pack should not appear.

---

### Step 35 — No Auth Errors

```
GET http://localhost:3002/api/cart
```

Expected 401 — no token.

```
POST http://localhost:3002/api/products
Content-Type: application/json
{ "name": "Test", "price": 1, "stock": 1 }
```

Expected 401 — no token.

---

### Step 36 — Duplicate Email

```
POST http://localhost:3002/api/auth/register
Content-Type: application/json

{
  "name": "Another Admin",
  "email": "admin@shop.com",
  "password": "pass1234"
}
```

Expected 409 conflict.

---

### Step 37 — Wrong Password

```
POST http://localhost:3002/api/auth/login
Content-Type: application/json

{
  "email": "admin@shop.com",
  "password": "wrongpassword"
}
```

Expected 401.

---

## Complete Test Order

```
 1. GET  /                                → API info
 2. POST /api/auth/register               → Admin
 3. POST /api/auth/register               → Customer
 4. POST /api/auth/login                  → Admin login → copy token
 5. GET  /api/auth/me                     → Admin profile [admin]
 6. POST /api/products                    → T-Shirt [admin]
 7. POST /api/products                    → Mug [admin]
 8. POST /api/products                    → Stickers [admin]
 9. POST /api/products                    → Hoodie [admin]
10. GET  /api/products                    → List all
11. GET  /api/products?category=apparel   → Filter
12. GET  /api/products?page=1&limit=2     → Paginate
13. GET  /api/products/1                  → Single product
14. PUT  /api/products/1                  → Update price [admin]
15. POST /api/auth/login                  → Customer login
16. POST /api/products                    → Customer blocked ❌
17. GET  /api/cart                        → Empty cart [customer]
18. POST /api/cart/add                    → Add T-Shirt ×2 [customer]
19. POST /api/cart/add                    → Add Mug ×1 [customer]
20. POST /api/cart/add                    → Add Stickers ×3 [customer]
21. GET  /api/cart                        → See 3 items + total
22. DELETE /api/cart/remove/3             → Remove stickers
23. POST /api/cart/add                    → Add 1 more T-Shirt
24. POST /api/cart/add                    → Over stock ❌
25. POST /api/orders/checkout             → Place order [customer]
26. GET  /api/cart                        → Cart empty now
27. GET  /api/products/1                  → Stock reduced
28. GET  /api/orders                      → Customer orders
29. GET  /api/orders/1                    → Order details
30. PATCH /api/orders/1/status            → Confirmed [admin]
31. PATCH /api/orders/1/status            → Shipped [admin]
32. PATCH /api/orders/1/status            → Delivered [admin]
33. POST /api/cart/add + checkout         → Second order
34. PATCH /api/orders/2/status            → Cancelled [admin]
35. POST /api/orders/checkout             → Empty cart ❌
36. DELETE /api/products/3                → Soft delete [admin]
37. GET  /api/products                    → Deleted gone
38. POST /api/auth/register               → Duplicate ❌
39. POST /api/auth/login                  → Wrong password ❌
```