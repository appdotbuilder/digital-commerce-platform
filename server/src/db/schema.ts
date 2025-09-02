import { 
  serial, 
  text, 
  pgTable, 
  timestamp, 
  numeric, 
  integer, 
  boolean, 
  pgEnum,
  json,
  inet,
  index,
  foreignKey,
  uniqueIndex
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'customer']);
export const licenseTypeEnum = pgEnum('license_type', ['single', 'multi', 'unlimited']);
export const discountTypeEnum = pgEnum('discount_type', ['percentage', 'fixed']);
export const orderStatusEnum = pgEnum('order_status', ['pending', 'paid', 'completed', 'cancelled', 'refunded']);
export const eventTypeEnum = pgEnum('event_type', ['page_view', 'product_view', 'add_to_cart', 'purchase', 'download']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  password_hash: text('password_hash').notNull(),
  first_name: text('first_name').notNull(),
  last_name: text('last_name').notNull(),
  role: userRoleEnum('role').notNull().default('customer'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  emailIdx: uniqueIndex('users_email_idx').on(table.email)
}));

// Categories table
export const categoriesTable = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  slug: text('slug').notNull(),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  slugIdx: uniqueIndex('categories_slug_idx').on(table.slug)
}));

// Products table
export const productsTable = pgTable('products', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  short_description: text('short_description'),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  category_id: integer('category_id').notNull(),
  image_url: text('image_url'),
  download_url: text('download_url'),
  file_size: integer('file_size'),
  version: text('version'),
  license_type: licenseTypeEnum('license_type'),
  is_active: boolean('is_active').notNull().default(true),
  stock_quantity: integer('stock_quantity').notNull().default(0),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  categoryFk: foreignKey({
    columns: [table.category_id],
    foreignColumns: [categoriesTable.id]
  }),
  categoryIdx: index('products_category_idx').on(table.category_id),
  priceIdx: index('products_price_idx').on(table.price),
  activeIdx: index('products_active_idx').on(table.is_active)
}));

// Coupons table
export const couponsTable = pgTable('coupons', {
  id: serial('id').primaryKey(),
  code: text('code').notNull(),
  description: text('description'),
  discount_type: discountTypeEnum('discount_type').notNull(),
  discount_value: numeric('discount_value', { precision: 10, scale: 2 }).notNull(),
  minimum_order: numeric('minimum_order', { precision: 10, scale: 2 }),
  usage_limit: integer('usage_limit'),
  used_count: integer('used_count').notNull().default(0),
  expires_at: timestamp('expires_at'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  codeIdx: uniqueIndex('coupons_code_idx').on(table.code),
  activeIdx: index('coupons_active_idx').on(table.is_active),
  expiresIdx: index('coupons_expires_idx').on(table.expires_at)
}));

// Orders table
export const ordersTable = pgTable('orders', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull(),
  order_number: text('order_number').notNull(),
  status: orderStatusEnum('status').notNull().default('pending'),
  subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull(),
  tax_amount: numeric('tax_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  discount_amount: numeric('discount_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  total_amount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  coupon_id: integer('coupon_id'),
  payment_method: text('payment_method'),
  payment_reference: text('payment_reference'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  userFk: foreignKey({
    columns: [table.user_id],
    foreignColumns: [usersTable.id]
  }),
  couponFk: foreignKey({
    columns: [table.coupon_id],
    foreignColumns: [couponsTable.id]
  }),
  orderNumberIdx: uniqueIndex('orders_order_number_idx').on(table.order_number),
  userIdx: index('orders_user_idx').on(table.user_id),
  statusIdx: index('orders_status_idx').on(table.status),
  createdIdx: index('orders_created_idx').on(table.created_at)
}));

// Order items table
export const orderItemsTable = pgTable('order_items', {
  id: serial('id').primaryKey(),
  order_id: integer('order_id').notNull(),
  product_id: integer('product_id').notNull(),
  quantity: integer('quantity').notNull(),
  unit_price: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  total_price: numeric('total_price', { precision: 10, scale: 2 }).notNull(),
  license_key: text('license_key'),
  download_expires_at: timestamp('download_expires_at'),
  created_at: timestamp('created_at').defaultNow().notNull()
}, (table) => ({
  orderFk: foreignKey({
    columns: [table.order_id],
    foreignColumns: [ordersTable.id]
  }),
  productFk: foreignKey({
    columns: [table.product_id],
    foreignColumns: [productsTable.id]
  }),
  orderIdx: index('order_items_order_idx').on(table.order_id),
  productIdx: index('order_items_product_idx').on(table.product_id)
}));

// Cart items table
export const cartItemsTable = pgTable('cart_items', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull(),
  product_id: integer('product_id').notNull(),
  quantity: integer('quantity').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  userFk: foreignKey({
    columns: [table.user_id],
    foreignColumns: [usersTable.id]
  }),
  productFk: foreignKey({
    columns: [table.product_id],
    foreignColumns: [productsTable.id]
  }),
  userProductIdx: uniqueIndex('cart_items_user_product_idx').on(table.user_id, table.product_id),
  userIdx: index('cart_items_user_idx').on(table.user_id)
}));

// Reviews table
export const reviewsTable = pgTable('reviews', {
  id: serial('id').primaryKey(),
  product_id: integer('product_id').notNull(),
  user_id: integer('user_id').notNull(),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  is_approved: boolean('is_approved').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  productFk: foreignKey({
    columns: [table.product_id],
    foreignColumns: [productsTable.id]
  }),
  userFk: foreignKey({
    columns: [table.user_id],
    foreignColumns: [usersTable.id]
  }),
  productIdx: index('reviews_product_idx').on(table.product_id),
  userIdx: index('reviews_user_idx').on(table.user_id),
  approvedIdx: index('reviews_approved_idx').on(table.is_approved),
  userProductIdx: uniqueIndex('reviews_user_product_idx').on(table.user_id, table.product_id)
}));

// Blog posts table
export const blogPostsTable = pgTable('blog_posts', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  content: text('content').notNull(),
  excerpt: text('excerpt'),
  featured_image: text('featured_image'),
  author_id: integer('author_id').notNull(),
  is_published: boolean('is_published').notNull().default(false),
  published_at: timestamp('published_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  authorFk: foreignKey({
    columns: [table.author_id],
    foreignColumns: [usersTable.id]
  }),
  slugIdx: uniqueIndex('blog_posts_slug_idx').on(table.slug),
  publishedIdx: index('blog_posts_published_idx').on(table.is_published),
  authorIdx: index('blog_posts_author_idx').on(table.author_id)
}));

// Analytics table
export const analyticsTable = pgTable('analytics', {
  id: serial('id').primaryKey(),
  event_type: eventTypeEnum('event_type').notNull(),
  event_data: json('event_data'),
  user_id: integer('user_id'),
  session_id: text('session_id'),
  ip_address: inet('ip_address'),
  user_agent: text('user_agent'),
  created_at: timestamp('created_at').defaultNow().notNull()
}, (table) => ({
  userFk: foreignKey({
    columns: [table.user_id],
    foreignColumns: [usersTable.id]
  }),
  eventTypeIdx: index('analytics_event_type_idx').on(table.event_type),
  userIdx: index('analytics_user_idx').on(table.user_id),
  createdIdx: index('analytics_created_idx').on(table.created_at),
  sessionIdx: index('analytics_session_idx').on(table.session_id)
}));

// Settings table
export const settingsTable = pgTable('settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  description: text('description'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  keyIdx: uniqueIndex('settings_key_idx').on(table.key)
}));

// Relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  orders: many(ordersTable),
  cartItems: many(cartItemsTable),
  reviews: many(reviewsTable),
  blogPosts: many(blogPostsTable)
}));

export const categoriesRelations = relations(categoriesTable, ({ many }) => ({
  products: many(productsTable)
}));

export const productsRelations = relations(productsTable, ({ one, many }) => ({
  category: one(categoriesTable, {
    fields: [productsTable.category_id],
    references: [categoriesTable.id]
  }),
  orderItems: many(orderItemsTable),
  cartItems: many(cartItemsTable),
  reviews: many(reviewsTable)
}));

export const couponsRelations = relations(couponsTable, ({ many }) => ({
  orders: many(ordersTable)
}));

export const ordersRelations = relations(ordersTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [ordersTable.user_id],
    references: [usersTable.id]
  }),
  coupon: one(couponsTable, {
    fields: [ordersTable.coupon_id],
    references: [couponsTable.id]
  }),
  items: many(orderItemsTable)
}));

export const orderItemsRelations = relations(orderItemsTable, ({ one }) => ({
  order: one(ordersTable, {
    fields: [orderItemsTable.order_id],
    references: [ordersTable.id]
  }),
  product: one(productsTable, {
    fields: [orderItemsTable.product_id],
    references: [productsTable.id]
  })
}));

export const cartItemsRelations = relations(cartItemsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [cartItemsTable.user_id],
    references: [usersTable.id]
  }),
  product: one(productsTable, {
    fields: [cartItemsTable.product_id],
    references: [productsTable.id]
  })
}));

export const reviewsRelations = relations(reviewsTable, ({ one }) => ({
  product: one(productsTable, {
    fields: [reviewsTable.product_id],
    references: [productsTable.id]
  }),
  user: one(usersTable, {
    fields: [reviewsTable.user_id],
    references: [usersTable.id]
  })
}));

export const blogPostsRelations = relations(blogPostsTable, ({ one }) => ({
  author: one(usersTable, {
    fields: [blogPostsTable.author_id],
    references: [usersTable.id]
  })
}));

export const analyticsRelations = relations(analyticsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [analyticsTable.user_id],
    references: [usersTable.id]
  })
}));

// Export all tables for proper query building
export const tables = {
  users: usersTable,
  categories: categoriesTable,
  products: productsTable,
  coupons: couponsTable,
  orders: ordersTable,
  orderItems: orderItemsTable,
  cartItems: cartItemsTable,
  reviews: reviewsTable,
  blogPosts: blogPostsTable,
  analytics: analyticsTable,
  settings: settingsTable
};