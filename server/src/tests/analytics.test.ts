import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  analyticsTable, 
  usersTable, 
  categoriesTable, 
  productsTable, 
  ordersTable,
  orderItemsTable
} from '../db/schema';
import { type TrackEventInput } from '../schema';
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
} from '../handlers/analytics';
import { eq } from 'drizzle-orm';

// Test input for tracking events
const testEventInput: TrackEventInput = {
  event_type: 'page_view',
  event_data: { page: '/home', user_agent: 'test-browser' },
  user_id: 1,
  session_id: 'session-123'
};

describe('Analytics Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('trackEvent', () => {
    it('should track an event successfully', async () => {
      // Create a user first
      await db.insert(usersTable).values({
        email: 'test@example.com',
        password_hash: 'hash',
        first_name: 'Test',
        last_name: 'User',
        role: 'customer'
      }).execute();

      const result = await trackEvent(testEventInput);

      expect(result.event_type).toEqual('page_view');
      expect(result.event_data).toEqual(testEventInput.event_data);
      expect(result.user_id).toEqual(1);
      expect(result.session_id).toEqual('session-123');
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should track event without user_id', async () => {
      const eventInput = {
        event_type: 'page_view' as const,
        event_data: { page: '/products' },
        session_id: 'session-456'
      };

      const result = await trackEvent(eventInput);

      expect(result.event_type).toEqual('page_view');
      expect(result.user_id).toBeNull();
      expect(result.session_id).toEqual('session-456');
    });

    it('should save event to database', async () => {
      // Create a user first for foreign key constraint
      await db.insert(usersTable).values({
        email: 'test2@example.com',
        password_hash: 'hash',
        first_name: 'Test',
        last_name: 'User',
        role: 'customer'
      }).execute();

      const result = await trackEvent(testEventInput);

      const savedEvent = await db.select()
        .from(analyticsTable)
        .where(eq(analyticsTable.id, result.id))
        .execute();

      expect(savedEvent).toHaveLength(1);
      expect(savedEvent[0].event_type).toEqual('page_view');
      expect(savedEvent[0].session_id).toEqual('session-123');
    });
  });

  describe('getDashboardStats', () => {
    it('should return dashboard statistics', async () => {
      // Create test data
      await db.insert(categoriesTable).values({
        name: 'Test Category',
        slug: 'test-category',
        description: 'A test category'
      }).execute();

      await db.insert(productsTable).values({
        name: 'Test Product',
        description: 'A test product',
        price: '19.99',
        category_id: 1,
        stock_quantity: 10
      }).execute();

      await db.insert(usersTable).values({
        email: 'customer@example.com',
        password_hash: 'hash',
        first_name: 'Test',
        last_name: 'Customer',
        role: 'customer'
      }).execute();

      await db.insert(ordersTable).values({
        user_id: 1,
        order_number: 'ORD-001',
        status: 'completed',
        subtotal: '19.99',
        tax_amount: '2.00',
        total_amount: '21.99'
      }).execute();

      // Add some analytics events
      await db.insert(analyticsTable).values({
        event_type: 'page_view',
        event_data: { page: '/home' },
        session_id: 'session-1'
      }).execute();

      const result = await getDashboardStats();

      expect(result.total_categories).toEqual(1);
      expect(result.total_products).toEqual(1);
      expect(result.total_customers).toEqual(1);
      expect(result.total_orders).toEqual(1);
      expect(result.total_revenue).toEqual(21.99);
      expect(Array.isArray(result.daily_visitors)).toBe(true);
      expect(Array.isArray(result.order_overview)).toBe(true);
    });

    it('should handle empty database', async () => {
      const result = await getDashboardStats();

      expect(result.total_categories).toEqual(0);
      expect(result.total_products).toEqual(0);
      expect(result.total_customers).toEqual(0);
      expect(result.total_orders).toEqual(0);
      expect(result.total_revenue).toEqual(0);
      expect(result.daily_visitors).toEqual([]);
      expect(result.order_overview).toEqual([]);
    });
  });

  describe('getVisitorAnalytics', () => {
    it('should return visitor analytics for date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      // Add test analytics data
      await db.insert(analyticsTable).values([
        {
          event_type: 'page_view',
          event_data: { page: '/home' },
          session_id: 'session-1',
          created_at: new Date('2024-01-15')
        },
        {
          event_type: 'page_view',
          event_data: { page: '/products' },
          session_id: 'session-2',
          created_at: new Date('2024-01-15')
        }
      ]).execute();

      const result = await getVisitorAnalytics(startDate, endDate);

      expect(result.page_views).toEqual(2);
      expect(result.unique_visitors).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(result.daily_stats)).toBe(true);
      expect(typeof result.bounce_rate).toBe('number');
    });

    it('should return zero metrics for empty date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');

      const result = await getVisitorAnalytics(startDate, endDate);

      expect(result.page_views).toEqual(0);
      expect(result.unique_visitors).toEqual(0);
      expect(result.daily_stats).toEqual([]);
    });
  });

  describe('getProductAnalytics', () => {
    it('should return product performance metrics', async () => {
      // Create test data
      await db.insert(categoriesTable).values({
        name: 'Test Category',
        slug: 'test-category',
        description: 'Test'
      }).execute();

      await db.insert(productsTable).values({
        name: 'Test Product',
        description: 'A test product',
        price: '29.99',
        category_id: 1,
        stock_quantity: 10
      }).execute();

      await db.insert(usersTable).values({
        email: 'test@example.com',
        password_hash: 'hash',
        first_name: 'Test',
        last_name: 'User',
        role: 'customer'
      }).execute();

      // Add product view events
      await db.insert(analyticsTable).values([
        {
          event_type: 'product_view',
          event_data: { product_id: '1' },
          session_id: 'session-1'
        },
        {
          event_type: 'add_to_cart',
          event_data: { product_id: '1' },
          session_id: 'session-1'
        }
      ]).execute();

      // Add order and order items
      await db.insert(ordersTable).values({
        user_id: 1,
        order_number: 'ORD-001',
        status: 'completed',
        subtotal: '29.99',
        tax_amount: '3.00',
        total_amount: '32.99'
      }).execute();

      await db.insert(orderItemsTable).values({
        order_id: 1,
        product_id: 1,
        quantity: 1,
        unit_price: '29.99',
        total_price: '29.99'
      }).execute();

      const result = await getProductAnalytics();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      const productMetrics = result[0];
      expect(productMetrics.product_id).toEqual(1);
      expect(productMetrics.product_name).toEqual('Test Product');
      expect(productMetrics.views).toEqual(1);
      expect(productMetrics.cart_adds).toEqual(1);
      expect(productMetrics.purchases).toEqual(1);
      expect(typeof productMetrics.conversion_rate).toBe('number');
      expect(productMetrics.revenue).toEqual(29.99);
    });

    it('should return empty array when no products have analytics', async () => {
      const result = await getProductAnalytics();
      expect(result).toEqual([]);
    });
  });

  describe('getSalesAnalytics', () => {
    it('should return sales performance data', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      // Create test data
      await db.insert(categoriesTable).values({
        name: 'Test Category',
        slug: 'test-category',
        description: 'Test'
      }).execute();

      await db.insert(productsTable).values({
        name: 'Test Product',
        description: 'A test product',
        price: '49.99',
        category_id: 1,
        stock_quantity: 10
      }).execute();

      await db.insert(usersTable).values({
        email: 'buyer@example.com',
        password_hash: 'hash',
        first_name: 'Test',
        last_name: 'Buyer',
        role: 'customer'
      }).execute();

      await db.insert(ordersTable).values({
        user_id: 1,
        order_number: 'ORD-001',
        status: 'completed',
        subtotal: '49.99',
        tax_amount: '5.00',
        total_amount: '54.99',
        created_at: new Date('2024-01-15')
      }).execute();

      await db.insert(orderItemsTable).values({
        order_id: 1,
        product_id: 1,
        quantity: 1,
        unit_price: '49.99',
        total_price: '49.99'
      }).execute();

      const result = await getSalesAnalytics(startDate, endDate);

      expect(result.total_sales).toEqual(1);
      expect(result.total_revenue).toEqual(54.99);
      expect(result.average_order_value).toEqual(54.99);
      expect(Array.isArray(result.daily_sales)).toBe(true);
      expect(Array.isArray(result.top_products)).toBe(true);
      
      if (result.top_products.length > 0) {
        expect(result.top_products[0].product_name).toEqual('Test Product');
        expect(result.top_products[0].sales_count).toEqual(1);
        expect(result.top_products[0].revenue).toEqual(49.99);
      }
    });

    it('should return zero metrics for empty date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');

      const result = await getSalesAnalytics(startDate, endDate);

      expect(result.total_sales).toEqual(0);
      expect(result.total_revenue).toEqual(0);
      expect(result.average_order_value).toEqual(0);
      expect(result.daily_sales).toEqual([]);
      expect(result.top_products).toEqual([]);
    });
  });

  describe('getUserBehaviorAnalytics', () => {
    it('should return user behavior insights', async () => {
      // Create test data
      await db.insert(categoriesTable).values({
        name: 'Test Category',
        slug: 'test-category',
        description: 'Test'
      }).execute();

      await db.insert(productsTable).values({
        name: 'Popular Product',
        description: 'A popular product',
        price: '19.99',
        category_id: 1,
        stock_quantity: 10
      }).execute();

      // Add behavior analytics
      await db.insert(analyticsTable).values([
        {
          event_type: 'page_view',
          event_data: { page: '/home' },
          session_id: 'session-1'
        },
        {
          event_type: 'page_view',
          event_data: { page: '/products' },
          session_id: 'session-1'
        },
        {
          event_type: 'product_view',
          event_data: { product_id: '1' },
          session_id: 'session-1'
        }
      ]).execute();

      const result = await getUserBehaviorAnalytics();

      expect(Array.isArray(result.most_viewed_pages)).toBe(true);
      expect(Array.isArray(result.user_journey)).toBe(true);
      expect(typeof result.session_duration).toBe('number');
      expect(Array.isArray(result.popular_products)).toBe(true);
      
      if (result.most_viewed_pages.length > 0) {
        expect(result.most_viewed_pages[0].page).toBeDefined();
        expect(typeof result.most_viewed_pages[0].views).toBe('number');
      }

      if (result.popular_products.length > 0) {
        expect(result.popular_products[0].product_name).toEqual('Popular Product');
        expect(result.popular_products[0].views).toEqual(1);
      }
    });

    it('should return empty arrays when no behavior data exists', async () => {
      const result = await getUserBehaviorAnalytics();

      expect(result.most_viewed_pages).toEqual([]);
      expect(result.popular_products).toEqual([]);
      expect(result.user_journey).toEqual([]);
      expect(result.session_duration).toEqual(0);
    });
  });

  describe('generateAnalyticsReport', () => {
    it('should generate sales report', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const result = await generateAnalyticsReport(startDate, endDate, 'sales');

      expect(result.report_type).toEqual('sales');
      expect(result.date_range.start).toEqual(startDate);
      expect(result.date_range.end).toEqual(endDate);
      expect(result.data).toBeDefined();
      expect(result.generated_at).toBeInstanceOf(Date);
      expect(result.data.total_sales).toBeDefined();
      expect(result.data.total_revenue).toBeDefined();
    });

    it('should generate traffic report', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const result = await generateAnalyticsReport(startDate, endDate, 'traffic');

      expect(result.report_type).toEqual('traffic');
      expect(result.data.page_views).toBeDefined();
      expect(result.data.unique_visitors).toBeDefined();
    });

    it('should generate products report', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const result = await generateAnalyticsReport(startDate, endDate, 'products');

      expect(result.report_type).toEqual('products');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should generate comprehensive report', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const result = await generateAnalyticsReport(startDate, endDate, 'comprehensive');

      expect(result.report_type).toEqual('comprehensive');
      expect(result.data.sales).toBeDefined();
      expect(result.data.traffic).toBeDefined();
      expect(result.data.products).toBeDefined();
      expect(result.data.dashboard).toBeDefined();
    });
  });

  describe('trackUserSession', () => {
    it('should track user session', async () => {
      // Create a user first
      await db.insert(usersTable).values({
        email: 'session@example.com',
        password_hash: 'hash',
        first_name: 'Session',
        last_name: 'User',
        role: 'customer'
      }).execute();

      await trackUserSession('session-abc', 1);

      // Verify session was tracked
      const sessionEvents = await db.select()
        .from(analyticsTable)
        .where(eq(analyticsTable.session_id, 'session-abc'))
        .execute();

      expect(sessionEvents.length).toBeGreaterThan(0);
      expect(sessionEvents[0].event_type).toEqual('page_view');
      expect(sessionEvents[0].user_id).toEqual(1);
    });

    it('should track anonymous session', async () => {
      await trackUserSession('anonymous-session');

      const sessionEvents = await db.select()
        .from(analyticsTable)
        .where(eq(analyticsTable.session_id, 'anonymous-session'))
        .execute();

      expect(sessionEvents.length).toBeGreaterThan(0);
      expect(sessionEvents[0].user_id).toBeNull();
    });
  });

  describe('getRealTimeAnalytics', () => {
    it('should return real-time metrics', async () => {
      // Create recent data (within 30 minutes)
      const recentTime = new Date();

      await db.insert(usersTable).values({
        email: 'realtime@example.com',
        password_hash: 'hash',
        first_name: 'Realtime',
        last_name: 'User',
        role: 'customer',
        created_at: recentTime
      }).execute();

      await db.insert(analyticsTable).values({
        event_type: 'page_view',
        event_data: { page: '/home' },
        session_id: 'active-session',
        created_at: recentTime
      }).execute();

      await db.insert(ordersTable).values({
        user_id: 1,
        order_number: 'ORD-RECENT',
        status: 'pending',
        subtotal: '25.00',
        tax_amount: '2.50',
        total_amount: '27.50',
        created_at: recentTime
      }).execute();

      const result = await getRealTimeAnalytics();

      expect(typeof result.active_users).toBe('number');
      expect(typeof result.current_page_views).toBe('number');
      expect(typeof result.recent_orders).toBe('number');
      expect(typeof result.recent_signups).toBe('number');
      expect(Array.isArray(result.live_events)).toBe(true);

      expect(result.active_users).toBeGreaterThanOrEqual(1);
      expect(result.current_page_views).toBeGreaterThanOrEqual(1);
      expect(result.recent_orders).toBeGreaterThanOrEqual(1);
      expect(result.recent_signups).toBeGreaterThanOrEqual(1);
    });

    it('should return zero metrics when no recent activity', async () => {
      const result = await getRealTimeAnalytics();

      expect(result.active_users).toEqual(0);
      expect(result.current_page_views).toEqual(0);
      expect(result.recent_orders).toEqual(0);
      expect(result.recent_signups).toEqual(0);
      expect(result.live_events).toEqual([]);
    });
  });
});