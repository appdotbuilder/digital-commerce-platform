import { db } from '../db';
import { 
  analyticsTable, 
  usersTable, 
  categoriesTable, 
  productsTable, 
  ordersTable,
  orderItemsTable
} from '../db/schema';
import { type TrackEventInput, type Analytics, type DashboardStats } from '../schema';
import { eq, count, sum, sql, desc, and, gte, lte, isNull, inArray } from 'drizzle-orm';

/**
 * Handler for tracking user events
 * This handler records user interactions and events for analytics
 */
export async function trackEvent(input: TrackEventInput): Promise<Analytics> {
  try {
    const result = await db.insert(analyticsTable)
      .values({
        event_type: input.event_type,
        event_data: input.event_data || null,
        user_id: input.user_id || null,
        session_id: input.session_id || null,
        ip_address: '127.0.0.1', // In real implementation, extract from request
        user_agent: 'User-Agent-String' // In real implementation, extract from request
      })
      .returning()
      .execute();

    return {
      ...result[0],
      event_data: result[0].event_data as Record<string, any> | null,
      created_at: result[0].created_at
    };
  } catch (error) {
    console.error('Event tracking failed:', error);
    throw error;
  }
}

/**
 * Handler for getting dashboard statistics
 * This handler retrieves key metrics for the admin dashboard
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    // Get total counts
    const [categoriesCount] = await db.select({ count: count() })
      .from(categoriesTable)
      .where(eq(categoriesTable.is_active, true))
      .execute();

    const [productsCount] = await db.select({ count: count() })
      .from(productsTable)
      .where(eq(productsTable.is_active, true))
      .execute();

    const [customersCount] = await db.select({ count: count() })
      .from(usersTable)
      .where(and(
        eq(usersTable.role, 'customer'),
        eq(usersTable.is_active, true)
      ))
      .execute();

    const [ordersCount] = await db.select({ count: count() })
      .from(ordersTable)
      .execute();

    // Get total revenue
    const revenueResult = await db.select({ 
      total: sql<string>`coalesce(sum(${ordersTable.total_amount}), '0')` 
    })
      .from(ordersTable)
      .where(eq(ordersTable.status, 'completed'))
      .execute();

    const totalRevenue = parseFloat(revenueResult[0]?.total || '0');

    // Get daily visitors for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const dailyVisitors = await db.select({
      date: sql<string>`date(${analyticsTable.created_at})`,
      count: count()
    })
      .from(analyticsTable)
      .where(and(
        eq(analyticsTable.event_type, 'page_view'),
        gte(analyticsTable.created_at, sevenDaysAgo)
      ))
      .groupBy(sql`date(${analyticsTable.created_at})`)
      .orderBy(sql`date(${analyticsTable.created_at})`)
      .execute();

    // Get order overview for the last 7 days
    const orderOverview = await db.select({
      date: sql<string>`date(${ordersTable.created_at})`,
      orders: count(),
      revenue: sql<string>`coalesce(sum(${ordersTable.total_amount}), '0')`
    })
      .from(ordersTable)
      .where(gte(ordersTable.created_at, sevenDaysAgo))
      .groupBy(sql`date(${ordersTable.created_at})`)
      .orderBy(sql`date(${ordersTable.created_at})`)
      .execute();

    return {
      total_categories: categoriesCount.count,
      total_products: productsCount.count,
      total_customers: customersCount.count,
      total_orders: ordersCount.count,
      total_revenue: totalRevenue,
      daily_visitors: dailyVisitors.map(dv => ({
        date: dv.date,
        count: dv.count
      })),
      order_overview: orderOverview.map(oo => ({
        date: oo.date,
        orders: oo.orders,
        revenue: parseFloat(oo.revenue)
      }))
    };
  } catch (error) {
    console.error('Dashboard stats retrieval failed:', error);
    throw error;
  }
}

/**
 * Handler for getting visitor analytics
 * This handler retrieves visitor statistics and trends
 */
export async function getVisitorAnalytics(startDate: Date, endDate: Date): Promise<{
  total_visitors: number;
  unique_visitors: number;
  page_views: number;
  bounce_rate: number;
  daily_stats: Array<{
    date: string;
    visitors: number;
    page_views: number;
  }>;
}> {
  try {
    // Get total page views
    const [pageViewsResult] = await db.select({ count: count() })
      .from(analyticsTable)
      .where(and(
        eq(analyticsTable.event_type, 'page_view'),
        gte(analyticsTable.created_at, startDate),
        lte(analyticsTable.created_at, endDate)
      ))
      .execute();

    // Get unique visitors (by session_id)
    const uniqueVisitorsResult = await db.select({ 
      unique_sessions: sql<string>`count(distinct ${analyticsTable.session_id})` 
    })
      .from(analyticsTable)
      .where(and(
        eq(analyticsTable.event_type, 'page_view'),
        gte(analyticsTable.created_at, startDate),
        lte(analyticsTable.created_at, endDate)
      ))
      .execute();

    // Get daily stats
    const dailyStats = await db.select({
      date: sql<string>`date(${analyticsTable.created_at})`,
      visitors: sql<string>`count(distinct ${analyticsTable.session_id})`,
      page_views: count()
    })
      .from(analyticsTable)
      .where(and(
        eq(analyticsTable.event_type, 'page_view'),
        gte(analyticsTable.created_at, startDate),
        lte(analyticsTable.created_at, endDate)
      ))
      .groupBy(sql`date(${analyticsTable.created_at})`)
      .orderBy(sql`date(${analyticsTable.created_at})`)
      .execute();

    return {
      total_visitors: parseInt(uniqueVisitorsResult[0]?.unique_sessions || '0'),
      unique_visitors: parseInt(uniqueVisitorsResult[0]?.unique_sessions || '0'),
      page_views: pageViewsResult.count,
      bounce_rate: 0, // Simplified - would need session analysis
      daily_stats: dailyStats.map(ds => ({
        date: ds.date,
        visitors: parseInt(ds.visitors),
        page_views: ds.page_views
      }))
    };
  } catch (error) {
    console.error('Visitor analytics retrieval failed:', error);
    throw error;
  }
}

/**
 * Handler for getting product analytics
 * This handler retrieves product performance metrics
 */
export async function getProductAnalytics(): Promise<Array<{
  product_id: number;
  product_name: string;
  views: number;
  cart_adds: number;
  purchases: number;
  conversion_rate: number;
  revenue: number;
}>> {
  try {
    // Get product views
    const productViews = await db.select({
      product_id: sql<number>`cast(${analyticsTable.event_data}->>'product_id' as integer)`,
      views: count()
    })
      .from(analyticsTable)
      .where(eq(analyticsTable.event_type, 'product_view'))
      .groupBy(sql`${analyticsTable.event_data}->>'product_id'`)
      .execute();

    // Get cart additions
    const cartAdds = await db.select({
      product_id: sql<number>`cast(${analyticsTable.event_data}->>'product_id' as integer)`,
      cart_adds: count()
    })
      .from(analyticsTable)
      .where(eq(analyticsTable.event_type, 'add_to_cart'))
      .groupBy(sql`${analyticsTable.event_data}->>'product_id'`)
      .execute();

    // Get purchases and revenue
    const purchases = await db.select({
      product_id: orderItemsTable.product_id,
      purchases: count(),
      revenue: sql<string>`sum(${orderItemsTable.total_price})`
    })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.order_id, ordersTable.id))
      .where(eq(ordersTable.status, 'completed'))
      .groupBy(orderItemsTable.product_id)
      .execute();

    // Combine data with product names
    const productIds = [...new Set([
      ...productViews.map(pv => pv.product_id),
      ...cartAdds.map(ca => ca.product_id),
      ...purchases.map(p => p.product_id)
    ])].filter(id => !isNaN(id));

    if (productIds.length === 0) {
      return [];
    }

    const products = await db.select({
      id: productsTable.id,
      name: productsTable.name
    })
      .from(productsTable)
      .where(inArray(productsTable.id, productIds))
      .execute();

    return products.map(product => {
      const views = productViews.find(pv => pv.product_id === product.id)?.views || 0;
      const cart_adds = cartAdds.find(ca => ca.product_id === product.id)?.cart_adds || 0;
      const purchase_data = purchases.find(p => p.product_id === product.id);
      const purchase_count = purchase_data?.purchases || 0;
      const revenue = parseFloat(purchase_data?.revenue || '0');
      
      return {
        product_id: product.id,
        product_name: product.name,
        views: views,
        cart_adds: cart_adds,
        purchases: purchase_count,
        conversion_rate: views > 0 ? (purchase_count / views) * 100 : 0,
        revenue: revenue
      };
    });
  } catch (error) {
    console.error('Product analytics retrieval failed:', error);
    throw error;
  }
}

/**
 * Handler for getting sales analytics
 * This handler retrieves sales performance data
 */
export async function getSalesAnalytics(startDate: Date, endDate: Date): Promise<{
  total_sales: number;
  total_revenue: number;
  average_order_value: number;
  daily_sales: Array<{
    date: string;
    orders: number;
    revenue: number;
  }>;
  top_products: Array<{
    product_id: number;
    product_name: string;
    sales_count: number;
    revenue: number;
  }>;
}> {
  try {
    // Get total sales and revenue
    const salesSummary = await db.select({
      total_orders: count(),
      total_revenue: sql<string>`coalesce(sum(${ordersTable.total_amount}), '0')`
    })
      .from(ordersTable)
      .where(and(
        eq(ordersTable.status, 'completed'),
        gte(ordersTable.created_at, startDate),
        lte(ordersTable.created_at, endDate)
      ))
      .execute();

    const totalOrders = salesSummary[0]?.total_orders || 0;
    const totalRevenue = parseFloat(salesSummary[0]?.total_revenue || '0');
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Get daily sales
    const dailySales = await db.select({
      date: sql<string>`date(${ordersTable.created_at})`,
      orders: count(),
      revenue: sql<string>`coalesce(sum(${ordersTable.total_amount}), '0')`
    })
      .from(ordersTable)
      .where(and(
        eq(ordersTable.status, 'completed'),
        gte(ordersTable.created_at, startDate),
        lte(ordersTable.created_at, endDate)
      ))
      .groupBy(sql`date(${ordersTable.created_at})`)
      .orderBy(sql`date(${ordersTable.created_at})`)
      .execute();

    // Get top products
    const topProducts = await db.select({
      product_id: orderItemsTable.product_id,
      product_name: productsTable.name,
      sales_count: count(),
      revenue: sql<string>`sum(${orderItemsTable.total_price})`
    })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.order_id, ordersTable.id))
      .innerJoin(productsTable, eq(orderItemsTable.product_id, productsTable.id))
      .where(and(
        eq(ordersTable.status, 'completed'),
        gte(ordersTable.created_at, startDate),
        lte(ordersTable.created_at, endDate)
      ))
      .groupBy(orderItemsTable.product_id, productsTable.name)
      .orderBy(desc(count()))
      .limit(10)
      .execute();

    return {
      total_sales: totalOrders,
      total_revenue: totalRevenue,
      average_order_value: avgOrderValue,
      daily_sales: dailySales.map(ds => ({
        date: ds.date,
        orders: ds.orders,
        revenue: parseFloat(ds.revenue)
      })),
      top_products: topProducts.map(tp => ({
        product_id: tp.product_id,
        product_name: tp.product_name,
        sales_count: tp.sales_count,
        revenue: parseFloat(tp.revenue)
      }))
    };
  } catch (error) {
    console.error('Sales analytics retrieval failed:', error);
    throw error;
  }
}

/**
 * Handler for getting user behavior analytics
 * This handler analyzes user behavior patterns
 */
export async function getUserBehaviorAnalytics(): Promise<{
  most_viewed_pages: Array<{ page: string; views: number }>;
  user_journey: Array<{ step: string; users: number; drop_off_rate: number }>;
  session_duration: number;
  popular_products: Array<{ product_id: number; product_name: string; views: number }>;
}> {
  try {
    // Get most viewed pages
    const mostViewedPages = await db.select({
      page: sql<string>`${analyticsTable.event_data}->>'page'`,
      views: count()
    })
      .from(analyticsTable)
      .where(eq(analyticsTable.event_type, 'page_view'))
      .groupBy(sql`${analyticsTable.event_data}->>'page'`)
      .orderBy(desc(count()))
      .limit(10)
      .execute();

    // Get popular products from product views
    const popularProducts = await db.select({
      product_id: sql<number>`cast(${analyticsTable.event_data}->>'product_id' as integer)`,
      product_name: productsTable.name,
      views: count()
    })
      .from(analyticsTable)
      .innerJoin(productsTable, sql`cast(${analyticsTable.event_data}->>'product_id' as integer) = ${productsTable.id}`)
      .where(eq(analyticsTable.event_type, 'product_view'))
      .groupBy(sql`${analyticsTable.event_data}->>'product_id'`, productsTable.name)
      .orderBy(desc(count()))
      .limit(10)
      .execute();

    return {
      most_viewed_pages: mostViewedPages
        .filter(mvp => mvp.page)
        .map(mvp => ({ page: mvp.page, views: mvp.views })),
      user_journey: [], // Simplified - would need complex session analysis
      session_duration: 0, // Simplified - would need session tracking
      popular_products: popularProducts.map(pp => ({
        product_id: pp.product_id,
        product_name: pp.product_name,
        views: pp.views
      }))
    };
  } catch (error) {
    console.error('User behavior analytics retrieval failed:', error);
    throw error;
  }
}

/**
 * Handler for generating analytics reports
 * This handler creates comprehensive analytics reports
 */
export async function generateAnalyticsReport(startDate: Date, endDate: Date, reportType: 'sales' | 'traffic' | 'products' | 'comprehensive'): Promise<{
  report_type: string;
  date_range: { start: Date; end: Date };
  data: any;
  generated_at: Date;
}> {
  try {
    let data: any = {};

    switch (reportType) {
      case 'sales':
        data = await getSalesAnalytics(startDate, endDate);
        break;
      case 'traffic':
        data = await getVisitorAnalytics(startDate, endDate);
        break;
      case 'products':
        data = await getProductAnalytics();
        break;
      case 'comprehensive':
        data = {
          sales: await getSalesAnalytics(startDate, endDate),
          traffic: await getVisitorAnalytics(startDate, endDate),
          products: await getProductAnalytics(),
          dashboard: await getDashboardStats()
        };
        break;
    }

    return {
      report_type: reportType,
      date_range: { start: startDate, end: endDate },
      data: data,
      generated_at: new Date()
    };
  } catch (error) {
    console.error('Analytics report generation failed:', error);
    throw error;
  }
}

/**
 * Handler for tracking user sessions
 * This handler manages user session tracking for analytics
 */
export async function trackUserSession(sessionId: string, userId?: number): Promise<void> {
  try {
    // Track session start event
    await trackEvent({
      event_type: 'page_view',
      event_data: { session_start: true },
      user_id: userId,
      session_id: sessionId
    });
  } catch (error) {
    console.error('User session tracking failed:', error);
    throw error;
  }
}

/**
 * Handler for getting real-time analytics
 * This handler provides real-time metrics for dashboard
 */
export async function getRealTimeAnalytics(): Promise<{
  active_users: number;
  current_page_views: number;
  recent_orders: number;
  recent_signups: number;
  live_events: Array<{
    event_type: string;
    timestamp: Date;
    details: any;
  }>;
}> {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    // Get active users (unique sessions in last 30 minutes)
    const activeUsersResult = await db.select({
      active_users: sql<string>`count(distinct ${analyticsTable.session_id})`
    })
      .from(analyticsTable)
      .where(gte(analyticsTable.created_at, thirtyMinutesAgo))
      .execute();

    // Get recent page views
    const [pageViewsResult] = await db.select({ count: count() })
      .from(analyticsTable)
      .where(and(
        eq(analyticsTable.event_type, 'page_view'),
        gte(analyticsTable.created_at, thirtyMinutesAgo)
      ))
      .execute();

    // Get recent orders
    const [recentOrdersResult] = await db.select({ count: count() })
      .from(ordersTable)
      .where(gte(ordersTable.created_at, thirtyMinutesAgo))
      .execute();

    // Get recent signups
    const [recentSignupsResult] = await db.select({ count: count() })
      .from(usersTable)
      .where(gte(usersTable.created_at, thirtyMinutesAgo))
      .execute();

    // Get live events
    const liveEvents = await db.select({
      event_type: analyticsTable.event_type,
      created_at: analyticsTable.created_at,
      event_data: analyticsTable.event_data
    })
      .from(analyticsTable)
      .where(gte(analyticsTable.created_at, thirtyMinutesAgo))
      .orderBy(desc(analyticsTable.created_at))
      .limit(10)
      .execute();

    return {
      active_users: parseInt(activeUsersResult[0]?.active_users || '0'),
      current_page_views: pageViewsResult.count,
      recent_orders: recentOrdersResult.count,
      recent_signups: recentSignupsResult.count,
      live_events: liveEvents.map(le => ({
        event_type: le.event_type,
        timestamp: le.created_at,
        details: le.event_data
      }))
    };
  } catch (error) {
    console.error('Real-time analytics retrieval failed:', error);
    throw error;
  }
}