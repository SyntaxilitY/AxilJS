Step 1 — Register as author
POST http://localhost:3001/api/auth/register
{
  "name":     "Tariq Mehmood",
  "email":    "tariq@syntaxility.dev",
  "password": "secret123",
  "role":     "author",
  "bio":      "Creator of AxilJS"
}

Step 2 — Login
POST http://localhost:3001/api/auth/login
{
  "email":    "tariq@syntaxility.dev",
  "password": "secret123"
}
→ Copy the token

Step 3 — Create a post
POST http://localhost:3001/api/posts
Authorization: Bearer <token>
{
  "title":   "Getting Started with AxilJS",
  "content": "AxilJS is a complete JavaScript backend ecosystem that provides every layer your application needs in one install. No assembling 40 packages from different teams...",
  "tags":    ["axiljs", "javascript", "backend"]
}

Step 4 — Publish the post
PATCH http://localhost:3001/api/posts/1/publish
Authorization: Bearer <token>

Step 5 — List all posts
GET http://localhost:3001/api/posts

Step 6 — Register as reader and add comment
POST http://localhost:3001/api/auth/register
{ "name": "Ahmed", "email": "ahmed@test.com", "password": "pass1234" }

POST http://localhost:3001/api/auth/login
{ "email": "ahmed@test.com", "password": "pass1234" }

POST http://localhost:3001/api/posts/1/comments
Authorization: Bearer <reader-token>
{ "content": "Great article! AxilJS looks amazing." }

Step 7 — View post with comments
GET http://localhost:3001/api/posts/1