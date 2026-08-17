import { Migration, Schema } from '@axiljs/orm'

const migration: Migration = {
  async up(db) {
    await Schema.create('users', (table) => {
      table.id()
      table.string('name', 255)
      table.string('email', 255).unique()
      table.boolean('is_active').default(true)
      table.timestamps()
    }, db, 'postgres')

    await Schema.create('posts', (table) => {
      table.id()
      table.string('title', 500)
      table.text('body')
      table.foreignKey('user_id', 'users')
      table.timestamps()
      table.index(['user_id'])
    }, db, 'postgres')

    console.log('✓ Tables created: users, posts')
  },

  async down(db) {
    await Schema.drop('posts', db)
    await Schema.drop('users', db)
    console.log('✓ Tables dropped')
  }
}

export default migration