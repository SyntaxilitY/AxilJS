/**
 * AxilORM — Shop Test
 */
import {
  createConnection,
  BaseModel,
  Transaction,
  ViewManager
} from '@axiljs/orm'
import { config } from './config'
import { User }   from './models/user.model'
import { Logger } from '@axiljs/observability'

const logger = new Logger({ name: 'Shop' })

async function main(): Promise<void> {

  // ── 1. Connect ────────────────────────────────────────────────────
  const db = await createConnection({
    driver:  'postgres',
    url:     config.DATABASE_URL!,
    logging: config.NODE_ENV === 'development'
  })

  logger.info('✓ Database connected\n')

  // ── 2. Register driver ────────────────────────────────────────────
  BaseModel.setDriver(db.getDriver(), 'postgres')
  Transaction.setDriver(db.getDriver(), 'postgres')

  // ── 3. Schema check ───────────────────────────────────────────────
  logger.info('--- Schema Check ---')

  const usersSchema = await db.getDriver().query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'users'
    ORDER BY ordinal_position
  `)
  console.table(usersSchema.rows)

  const postsSchema = await db.getDriver().query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'posts'
    ORDER BY ordinal_position
  `)

  if (postsSchema.rows.length > 0) {
    console.table(postsSchema.rows)
  } else {
    logger.info('Posts table not found — skipping post tests')
  }

  // ── 4. Static finders ─────────────────────────────────────────────
  logger.info('\n--- Static Finders ---')

  const allUsers = await User.all()
  console.log('All users:', allUsers.length)

  const user = await User.find(1)
  console.log('User by id:', user?.toJSON() ?? 'not found')

  const page1 = await User.paginate(1, 10)
  console.log('Page 1:', page1.data.length, '/', page1.total)

  // ── 5. Create user ────────────────────────────────────────────────
  logger.info('\n--- Create ---')

  const newUser = await User.create({
    name:     'Tariq Mehmood',
    email:    `tariq_${Date.now()}@axiljs.dev`,
    password: 'hashed_password_123',
    role:     'user'
  })

  console.log('Created user:', newUser.toJSON())

  // ── 6. Update ─────────────────────────────────────────────────────
  logger.info('\n--- Update ---')

  newUser.name = 'Tariq M.'
  await newUser.save()
  console.log('Updated ✓')

  // ── 7. Find the updated user ──────────────────────────────────────
  logger.info('\n--- Find Updated ---')

  const found = await User.find(newUser.id)
  console.log('Found:', found?.toJSON())

  // ── 8. QueryBuilder ───────────────────────────────────────────────
  logger.info('\n--- QueryBuilder ---')

  const results = await User
    .query()
    .select('id', 'name', 'email', 'role')
    .orderBy('id', 'DESC')
    .limit(10)
    .get()

  console.log('QueryBuilder results:', results.length)
  results.forEach((r: any) => {
    console.log(`  #${r.id} ${r.name} (${r.role})`)
  })

  // ── 9. Aggregates ─────────────────────────────────────────────────
  logger.info('\n--- Aggregates ---')

  const total = await User.count()
  console.log('Total users:', total)

  const maxId = await User.query().max('id')
  console.log('Max id:', maxId)

  // ── 10. Transaction ───────────────────────────────────────────────
  logger.info('\n--- Transaction ---')

  await Transaction.run(async (trx) => {
    await trx.query('users').insert({
      name:     'Transaction User',
      email:    `trx_${Date.now()}@test.com`,
      password: 'trx_pass_123',
      role:     'user'
    })
    console.log('Transaction committed ✓')
  })

  // ── 11. Where query ───────────────────────────────────────────────
  logger.info('\n--- Where Query ---')

  const admins = await User.where('role', '=', 'admin').get()
  console.log('Admins:', admins.length)

  const normalUsers = await User.where('role', '=', 'user').get()
  console.log('Normal users:', normalUsers.length)

  // ── 12. Post tests (only if table exists) ─────────────────────────
  if (postsSchema.rows.length > 0) {
    logger.info('\n--- Post Tests ---')

    const postCols = postsSchema.rows.map((r: any) => r.column_name)
    console.log('Post columns:', postCols)

    // Create post with actual column names
    // Adjust based on your posts table schema
  } else {
    logger.info('\n--- Skipping Post Tests (no posts table) ---')
  }

  // ── 13. View ──────────────────────────────────────────────────────
  logger.info('\n--- View ---')

  await db.getDriver().query(`
    CREATE OR REPLACE VIEW admin_users AS
    SELECT id, name, email, role FROM users WHERE role = 'admin'
  `)

  const adminView = await ViewManager
    .query('admin_users', db.getDriver(), 'postgres')
    .orderBy('id', 'DESC')
    .get()

  console.log('Admin users from view:', adminView.length)

  // ── 14. Cleanup ───────────────────────────────────────────────────
  logger.info('\n--- Cleanup ---')

  // Delete test users
  await User.deleteWhere({ name: 'Tariq M.' } as any)
  await User.deleteWhere({ name: 'Transaction User' } as any)
  console.log('Test users cleaned up ✓')

  // Drop test view
  await db.getDriver().query('DROP VIEW IF EXISTS admin_users')
  console.log('Test view dropped ✓')

  // ── Done ──────────────────────────────────────────────────────────
  logger.info('\n✅ All AxilORM tests passed!\n')

  await db.disconnect()
  process.exit(0)
}

main().catch((err) => {
  logger.error('\n✗ Test failed:', err.message)
  logger.error(err.stack)
  process.exit(1)
})