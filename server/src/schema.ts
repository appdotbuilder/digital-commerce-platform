import { z } from 'zod';

// User schema and types
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  password_hash: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  role: z.enum(['admin', 'customer']),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

export const createUserInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  role: z.enum(['admin', 'customer']).default('customer')
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export type LoginInput = z.infer<typeof loginInputSchema>;

// Category schema and types
export const categorySchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  slug: z.string(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Category = z.infer<typeof categorySchema>;

export const createCategoryInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  slug: z.string().min(1)
});

export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;

export const updateCategoryInputSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  slug: z.string().min(1).optional(),
  is_active: z.boolean().optional()
});

export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>;

// Product schema and types
export const productSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  short_description: z.string().nullable(),
  price: z.number(),
  category_id: z.number(),
  image_url: z.string().nullable(),
  download_url: z.string().nullable(),
  file_size: z.number().nullable(),
  version: z.string().nullable(),
  license_type: z.enum(['single', 'multi', 'unlimited']).nullable(),
  is_active: z.boolean(),
  stock_quantity: z.number().int(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Product = z.infer<typeof productSchema>;

export const createProductInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  short_description: z.string().nullable(),
  price: z.number().positive(),
  category_id: z.number(),
  image_url: z.string().nullable(),
  download_url: z.string().nullable(),
  file_size: z.number().nullable(),
  version: z.string().nullable(),
  license_type: z.enum(['single', 'multi', 'unlimited']).nullable(),
  stock_quantity: z.number().int().nonnegative()
});

export type CreateProductInput = z.infer<typeof createProductInputSchema>;

export const updateProductInputSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  short_description: z.string().nullable().optional(),
  price: z.number().positive().optional(),
  category_id: z.number().optional(),
  image_url: z.string().nullable().optional(),
  download_url: z.string().nullable().optional(),
  file_size: z.number().nullable().optional(),
  version: z.string().nullable().optional(),
  license_type: z.enum(['single', 'multi', 'unlimited']).nullable().optional(),
  is_active: z.boolean().optional(),
  stock_quantity: z.number().int().nonnegative().optional()
});

export type UpdateProductInput = z.infer<typeof updateProductInputSchema>;

// Coupon schema and types
export const couponSchema = z.object({
  id: z.number(),
  code: z.string(),
  description: z.string().nullable(),
  discount_type: z.enum(['percentage', 'fixed']),
  discount_value: z.number(),
  minimum_order: z.number().nullable(),
  usage_limit: z.number().nullable(),
  used_count: z.number().int(),
  expires_at: z.coerce.date().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Coupon = z.infer<typeof couponSchema>;

export const createCouponInputSchema = z.object({
  code: z.string().min(1),
  description: z.string().nullable(),
  discount_type: z.enum(['percentage', 'fixed']),
  discount_value: z.number().positive(),
  minimum_order: z.number().nullable(),
  usage_limit: z.number().nullable(),
  expires_at: z.coerce.date().nullable()
});

export type CreateCouponInput = z.infer<typeof createCouponInputSchema>;

export const updateCouponInputSchema = z.object({
  id: z.number(),
  code: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  discount_type: z.enum(['percentage', 'fixed']).optional(),
  discount_value: z.number().positive().optional(),
  minimum_order: z.number().nullable().optional(),
  usage_limit: z.number().nullable().optional(),
  expires_at: z.coerce.date().nullable().optional(),
  is_active: z.boolean().optional()
});

export type UpdateCouponInput = z.infer<typeof updateCouponInputSchema>;

// Order schema and types
export const orderSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  order_number: z.string(),
  status: z.enum(['pending', 'paid', 'completed', 'cancelled', 'refunded']),
  subtotal: z.number(),
  tax_amount: z.number(),
  discount_amount: z.number(),
  total_amount: z.number(),
  coupon_id: z.number().nullable(),
  payment_method: z.string().nullable(),
  payment_reference: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Order = z.infer<typeof orderSchema>;

export const createOrderInputSchema = z.object({
  user_id: z.number(),
  items: z.array(z.object({
    product_id: z.number(),
    quantity: z.number().int().positive(),
    price: z.number().positive()
  })),
  coupon_code: z.string().optional()
});

export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

// Order Item schema and types
export const orderItemSchema = z.object({
  id: z.number(),
  order_id: z.number(),
  product_id: z.number(),
  quantity: z.number().int(),
  unit_price: z.number(),
  total_price: z.number(),
  license_key: z.string().nullable(),
  download_expires_at: z.coerce.date().nullable(),
  created_at: z.coerce.date()
});

export type OrderItem = z.infer<typeof orderItemSchema>;

// Cart schema and types
export const cartItemSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  product_id: z.number(),
  quantity: z.number().int(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type CartItem = z.infer<typeof cartItemSchema>;

export const addToCartInputSchema = z.object({
  user_id: z.number(),
  product_id: z.number(),
  quantity: z.number().int().positive()
});

export type AddToCartInput = z.infer<typeof addToCartInputSchema>;

export const updateCartItemInputSchema = z.object({
  id: z.number(),
  quantity: z.number().int().positive()
});

export type UpdateCartItemInput = z.infer<typeof updateCartItemInputSchema>;

// Review schema and types
export const reviewSchema = z.object({
  id: z.number(),
  product_id: z.number(),
  user_id: z.number(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  is_approved: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Review = z.infer<typeof reviewSchema>;

export const createReviewInputSchema = z.object({
  product_id: z.number(),
  user_id: z.number(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable()
});

export type CreateReviewInput = z.infer<typeof createReviewInputSchema>;

export const moderateReviewInputSchema = z.object({
  id: z.number(),
  is_approved: z.boolean()
});

export type ModerateReviewInput = z.infer<typeof moderateReviewInputSchema>;

// Blog schema and types
export const blogPostSchema = z.object({
  id: z.number(),
  title: z.string(),
  slug: z.string(),
  content: z.string(),
  excerpt: z.string().nullable(),
  featured_image: z.string().nullable(),
  author_id: z.number(),
  is_published: z.boolean(),
  published_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type BlogPost = z.infer<typeof blogPostSchema>;

export const createBlogPostInputSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  content: z.string().min(1),
  excerpt: z.string().nullable(),
  featured_image: z.string().nullable(),
  author_id: z.number(),
  is_published: z.boolean().default(false)
});

export type CreateBlogPostInput = z.infer<typeof createBlogPostInputSchema>;

// Contact schema and types
export const contactFormSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  subject: z.string().min(1),
  message: z.string().min(1)
});

export type ContactFormInput = z.infer<typeof contactFormSchema>;

// Analytics schema and types
export const analyticsSchema = z.object({
  id: z.number(),
  event_type: z.enum(['page_view', 'product_view', 'add_to_cart', 'purchase', 'download']),
  event_data: z.record(z.any()).nullable(),
  user_id: z.number().nullable(),
  session_id: z.string().nullable(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  created_at: z.coerce.date()
});

export type Analytics = z.infer<typeof analyticsSchema>;

export const trackEventInputSchema = z.object({
  event_type: z.enum(['page_view', 'product_view', 'add_to_cart', 'purchase', 'download']),
  event_data: z.record(z.any()).nullable(),
  user_id: z.number().optional(),
  session_id: z.string().optional()
});

export type TrackEventInput = z.infer<typeof trackEventInputSchema>;

// Settings schema and types
export const settingSchema = z.object({
  id: z.number(),
  key: z.string(),
  value: z.string(),
  description: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Setting = z.infer<typeof settingSchema>;

export const updateSettingInputSchema = z.object({
  key: z.string(),
  value: z.string()
});

export type UpdateSettingInput = z.infer<typeof updateSettingInputSchema>;

// Dashboard statistics schema
export const dashboardStatsSchema = z.object({
  total_categories: z.number().int(),
  total_products: z.number().int(),
  total_customers: z.number().int(),
  total_orders: z.number().int(),
  total_revenue: z.number(),
  daily_visitors: z.array(z.object({
    date: z.string(),
    count: z.number().int()
  })),
  order_overview: z.array(z.object({
    date: z.string(),
    orders: z.number().int(),
    revenue: z.number()
  }))
});

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

// Filter schemas
export const productFiltersSchema = z.object({
  category_id: z.number().optional(),
  min_price: z.number().optional(),
  max_price: z.number().optional(),
  search: z.string().optional(),
  sort_by: z.enum(['name', 'price', 'created_at']).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().default(10)
});

export type ProductFilters = z.infer<typeof productFiltersSchema>;

export const orderFiltersSchema = z.object({
  status: z.enum(['pending', 'paid', 'completed', 'cancelled', 'refunded']).optional(),
  user_id: z.number().optional(),
  date_from: z.coerce.date().optional(),
  date_to: z.coerce.date().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().default(10)
});

export type OrderFilters = z.infer<typeof orderFiltersSchema>;