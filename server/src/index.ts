import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import all schemas
import {
  // Auth schemas
  createUserInputSchema,
  loginInputSchema,
  
  // Category schemas
  createCategoryInputSchema,
  updateCategoryInputSchema,
  
  // Product schemas
  createProductInputSchema,
  updateProductInputSchema,
  productFiltersSchema,
  
  // Coupon schemas
  createCouponInputSchema,
  updateCouponInputSchema,
  
  // Order schemas
  createOrderInputSchema,
  orderFiltersSchema,
  
  // Cart schemas
  addToCartInputSchema,
  updateCartItemInputSchema,
  
  // Review schemas
  createReviewInputSchema,
  moderateReviewInputSchema,
  
  // Blog schemas
  createBlogPostInputSchema,
  
  // Contact schema
  contactFormSchema,
  
  // Analytics schemas
  trackEventInputSchema,
  
  // Settings schema
  updateSettingInputSchema
} from './schema';

// Import all handlers
import { registerUser, loginUser, getCurrentUser } from './handlers/auth';
import { 
  createCategory, 
  getCategories, 
  getActiveCategories, 
  getCategoryById, 
  updateCategory, 
  deleteCategory 
} from './handlers/categories';
import { 
  createProduct, 
  getProducts, 
  getActiveProducts, 
  getProductById, 
  getProductsByCategory, 
  updateProduct, 
  deleteProduct, 
  searchProducts 
} from './handlers/products';
import { 
  createCoupon, 
  getCoupons, 
  getActiveCoupons, 
  validateCoupon, 
  applyCoupon, 
  getCouponById, 
  updateCoupon, 
  deleteCoupon 
} from './handlers/coupons';
import { 
  createOrder, 
  getOrders, 
  getOrdersByUser, 
  getOrderById, 
  updateOrderStatus, 
  processOrderPayment, 
  generateLicenseKeys, 
  getOrderStatistics, 
  refundOrder 
} from './handlers/orders';
import { 
  addToCart, 
  getCartItems, 
  updateCartItem, 
  removeFromCart, 
  clearCart, 
  calculateCartTotal, 
  validateCart, 
  getCartItemCount 
} from './handlers/cart';
import { 
  createReview, 
  getProductReviews, 
  getAllReviews, 
  getPendingReviews, 
  moderateReview, 
  getProductReviewStats, 
  getUserReviews, 
  deleteReview, 
  canUserReviewProduct 
} from './handlers/reviews';
import { 
  createBlogPost, 
  getAllBlogPosts, 
  getPublishedBlogPosts, 
  getBlogPostBySlug, 
  getBlogPostById, 
  updateBlogPost, 
  toggleBlogPostPublication, 
  deleteBlogPost, 
  getRecentBlogPosts, 
  searchBlogPosts 
} from './handlers/blog';
import { 
  submitContactForm, 
  getContactSubmissions, 
  markContactSubmissionAsRead, 
  replyToContactSubmission, 
  getContactSubmissionStats, 
  deleteContactSubmission, 
  exportContactSubmissions 
} from './handlers/contact';
import { 
  trackEvent, 
  getDashboardStats, 
  getVisitorAnalytics, 
  getProductAnalytics, 
  getSalesAnalytics, 
  getUserBehaviorAnalytics, 
  generateAnalyticsReport, 
  trackUserSession, 
  getRealTimeAnalytics 
} from './handlers/analytics';
import { 
  getSettings, 
  getSettingByKey, 
  updateSetting, 
  updateMultipleSettings, 
  deleteSetting, 
  getDefaultSettings, 
  initializeDefaultSettings, 
  validateSettingValue, 
  getSettingsByCategory, 
  backupSettings, 
  restoreSettings 
} from './handlers/settings';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  auth: router({
    register: publicProcedure
      .input(createUserInputSchema)
      .mutation(({ input }) => registerUser(input)),
    
    login: publicProcedure
      .input(loginInputSchema)
      .mutation(({ input }) => loginUser(input)),
    
    getCurrentUser: publicProcedure
      .input(z.string())
      .query(({ input }) => getCurrentUser(input)),
  }),

  // Category management routes
  categories: router({
    create: publicProcedure
      .input(createCategoryInputSchema)
      .mutation(({ input }) => createCategory(input)),
    
    getAll: publicProcedure
      .query(() => getCategories()),
    
    getActive: publicProcedure
      .query(() => getActiveCategories()),
    
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getCategoryById(input)),
    
    update: publicProcedure
      .input(updateCategoryInputSchema)
      .mutation(({ input }) => updateCategory(input)),
    
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteCategory(input)),
  }),

  // Product management routes
  products: router({
    create: publicProcedure
      .input(createProductInputSchema)
      .mutation(({ input }) => createProduct(input)),
    
    getAll: publicProcedure
      .input(productFiltersSchema.optional())
      .query(({ input }) => getProducts(input)),
    
    getActive: publicProcedure
      .input(productFiltersSchema.optional())
      .query(({ input }) => getActiveProducts(input)),
    
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getProductById(input)),
    
    getByCategory: publicProcedure
      .input(z.object({
        categoryId: z.number(),
        filters: productFiltersSchema.omit({ category_id: true }).optional()
      }))
      .query(({ input }) => getProductsByCategory(input.categoryId, input.filters)),
    
    update: publicProcedure
      .input(updateProductInputSchema)
      .mutation(({ input }) => updateProduct(input)),
    
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteProduct(input)),
    
    search: publicProcedure
      .input(z.object({
        query: z.string(),
        filters: productFiltersSchema.omit({ search: true }).optional()
      }))
      .query(({ input }) => searchProducts(input.query, input.filters)),
  }),

  // Coupon management routes
  coupons: router({
    create: publicProcedure
      .input(createCouponInputSchema)
      .mutation(({ input }) => createCoupon(input)),
    
    getAll: publicProcedure
      .query(() => getCoupons()),
    
    getActive: publicProcedure
      .query(() => getActiveCoupons()),
    
    validate: publicProcedure
      .input(z.object({ code: z.string(), orderTotal: z.number() }))
      .query(({ input }) => validateCoupon(input.code, input.orderTotal)),
    
    apply: publicProcedure
      .input(z.object({ code: z.string(), orderId: z.number() }))
      .mutation(({ input }) => applyCoupon(input.code, input.orderId)),
    
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getCouponById(input)),
    
    update: publicProcedure
      .input(updateCouponInputSchema)
      .mutation(({ input }) => updateCoupon(input)),
    
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteCoupon(input)),
  }),

  // Order management routes
  orders: router({
    create: publicProcedure
      .input(createOrderInputSchema)
      .mutation(({ input }) => createOrder(input)),
    
    getAll: publicProcedure
      .input(orderFiltersSchema.optional())
      .query(({ input }) => getOrders(input)),
    
    getByUser: publicProcedure
      .input(z.number())
      .query(({ input }) => getOrdersByUser(input)),
    
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getOrderById(input)),
    
    updateStatus: publicProcedure
      .input(z.object({ id: z.number(), status: z.enum(['pending', 'paid', 'completed', 'cancelled', 'refunded']) }))
      .mutation(({ input }) => updateOrderStatus(input.id, input.status)),
    
    processPayment: publicProcedure
      .input(z.object({ orderId: z.number(), paymentMethod: z.string(), paymentReference: z.string() }))
      .mutation(({ input }) => processOrderPayment(input.orderId, input.paymentMethod, input.paymentReference)),
    
    generateLicenseKeys: publicProcedure
      .input(z.number())
      .mutation(({ input }) => generateLicenseKeys(input)),
    
    getStatistics: publicProcedure
      .query(() => getOrderStatistics()),
    
    refund: publicProcedure
      .input(z.object({ orderId: z.number(), reason: z.string().optional() }))
      .mutation(({ input }) => refundOrder(input.orderId, input.reason)),
  }),

  // Shopping cart routes
  cart: router({
    addItem: publicProcedure
      .input(addToCartInputSchema)
      .mutation(({ input }) => addToCart(input)),
    
    getItems: publicProcedure
      .input(z.number())
      .query(({ input }) => getCartItems(input)),
    
    updateItem: publicProcedure
      .input(updateCartItemInputSchema)
      .mutation(({ input }) => updateCartItem(input)),
    
    removeItem: publicProcedure
      .input(z.object({ cartItemId: z.number(), userId: z.number() }))
      .mutation(({ input }) => removeFromCart(input.cartItemId, input.userId)),
    
    clear: publicProcedure
      .input(z.number())
      .mutation(({ input }) => clearCart(input)),
    
    calculateTotal: publicProcedure
      .input(z.object({ userId: z.number(), couponCode: z.string().optional() }))
      .query(({ input }) => calculateCartTotal(input.userId, input.couponCode)),
    
    validate: publicProcedure
      .input(z.number())
      .query(({ input }) => validateCart(input)),
    
    getItemCount: publicProcedure
      .input(z.number())
      .query(({ input }) => getCartItemCount(input)),
  }),

  // Review management routes
  reviews: router({
    create: publicProcedure
      .input(createReviewInputSchema)
      .mutation(({ input }) => createReview(input)),
    
    getProductReviews: publicProcedure
      .input(z.number())
      .query(({ input }) => getProductReviews(input)),
    
    getAll: publicProcedure
      .query(() => getAllReviews()),
    
    getPending: publicProcedure
      .query(() => getPendingReviews()),
    
    moderate: publicProcedure
      .input(moderateReviewInputSchema)
      .mutation(({ input }) => moderateReview(input)),
    
    getProductStats: publicProcedure
      .input(z.number())
      .query(({ input }) => getProductReviewStats(input)),
    
    getUserReviews: publicProcedure
      .input(z.number())
      .query(({ input }) => getUserReviews(input)),
    
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteReview(input)),
    
    canUserReview: publicProcedure
      .input(z.object({ userId: z.number(), productId: z.number() }))
      .query(({ input }) => canUserReviewProduct(input.userId, input.productId)),
  }),

  // Blog management routes
  blog: router({
    create: publicProcedure
      .input(createBlogPostInputSchema)
      .mutation(({ input }) => createBlogPost(input)),
    
    getAll: publicProcedure
      .query(() => getAllBlogPosts()),
    
    getPublished: publicProcedure
      .input(z.object({ page: z.number().default(1), limit: z.number().default(10) }))
      .query(({ input }) => getPublishedBlogPosts(input.page, input.limit)),
    
    getBySlug: publicProcedure
      .input(z.string())
      .query(({ input }) => getBlogPostBySlug(input)),
    
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getBlogPostById(input)),
    
    update: publicProcedure
      .input(z.object({ id: z.number(), data: createBlogPostInputSchema.partial() }))
      .mutation(({ input }) => updateBlogPost(input.id, input.data)),
    
    togglePublication: publicProcedure
      .input(z.object({ id: z.number(), isPublished: z.boolean() }))
      .mutation(({ input }) => toggleBlogPostPublication(input.id, input.isPublished)),
    
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteBlogPost(input)),
    
    getRecent: publicProcedure
      .input(z.number().default(5))
      .query(({ input }) => getRecentBlogPosts(input)),
    
    search: publicProcedure
      .input(z.object({ query: z.string(), page: z.number().default(1), limit: z.number().default(10) }))
      .query(({ input }) => searchBlogPosts(input.query, input.page, input.limit)),
  }),

  // Contact form routes
  contact: router({
    submit: publicProcedure
      .input(contactFormSchema)
      .mutation(({ input }) => submitContactForm(input)),
    
    getSubmissions: publicProcedure
      .query(() => getContactSubmissions()),
    
    markAsRead: publicProcedure
      .input(z.number())
      .mutation(({ input }) => markContactSubmissionAsRead(input)),
    
    reply: publicProcedure
      .input(z.object({ id: z.number(), replyMessage: z.string() }))
      .mutation(({ input }) => replyToContactSubmission(input.id, input.replyMessage)),
    
    getStats: publicProcedure
      .query(() => getContactSubmissionStats()),
    
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteContactSubmission(input)),
    
    export: publicProcedure
      .input(z.object({ startDate: z.date().optional(), endDate: z.date().optional() }))
      .query(({ input }) => exportContactSubmissions(input.startDate, input.endDate)),
  }),

  // Analytics routes
  analytics: router({
    trackEvent: publicProcedure
      .input(trackEventInputSchema)
      .mutation(({ input }) => trackEvent(input)),
    
    getDashboardStats: publicProcedure
      .query(() => getDashboardStats()),
    
    getVisitorAnalytics: publicProcedure
      .input(z.object({ startDate: z.date(), endDate: z.date() }))
      .query(({ input }) => getVisitorAnalytics(input.startDate, input.endDate)),
    
    getProductAnalytics: publicProcedure
      .query(() => getProductAnalytics()),
    
    getSalesAnalytics: publicProcedure
      .input(z.object({ startDate: z.date(), endDate: z.date() }))
      .query(({ input }) => getSalesAnalytics(input.startDate, input.endDate)),
    
    getUserBehaviorAnalytics: publicProcedure
      .query(() => getUserBehaviorAnalytics()),
    
    generateReport: publicProcedure
      .input(z.object({ 
        startDate: z.date(), 
        endDate: z.date(), 
        reportType: z.enum(['sales', 'traffic', 'products', 'comprehensive']) 
      }))
      .query(({ input }) => generateAnalyticsReport(input.startDate, input.endDate, input.reportType)),
    
    trackUserSession: publicProcedure
      .input(z.object({ sessionId: z.string(), userId: z.number().optional() }))
      .mutation(({ input }) => trackUserSession(input.sessionId, input.userId)),
    
    getRealTimeAnalytics: publicProcedure
      .query(() => getRealTimeAnalytics()),
  }),

  // Settings management routes
  settings: router({
    getAll: publicProcedure
      .query(() => getSettings()),
    
    getByKey: publicProcedure
      .input(z.string())
      .query(({ input }) => getSettingByKey(input)),
    
    update: publicProcedure
      .input(updateSettingInputSchema)
      .mutation(({ input }) => updateSetting(input)),
    
    updateMultiple: publicProcedure
      .input(z.array(updateSettingInputSchema))
      .mutation(({ input }) => updateMultipleSettings(input)),
    
    delete: publicProcedure
      .input(z.string())
      .mutation(({ input }) => deleteSetting(input)),
    
    getDefaults: publicProcedure
      .query(() => getDefaultSettings()),
    
    initializeDefaults: publicProcedure
      .mutation(() => initializeDefaultSettings()),
    
    validateValue: publicProcedure
      .input(z.object({ key: z.string(), value: z.string() }))
      .query(({ input }) => validateSettingValue(input.key, input.value)),
    
    getByCategory: publicProcedure
      .query(() => getSettingsByCategory()),
    
    backup: publicProcedure
      .query(() => backupSettings()),
    
    restore: publicProcedure
      .input(z.string())
      .mutation(({ input }) => restoreSettings(input)),
  }),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC server listening at port: ${port}`);
}

start();