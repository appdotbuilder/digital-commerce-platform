import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, categoriesTable, productsTable, couponsTable, ordersTable, orderItemsTable } from '../db/schema';
import { type CreateOrderInput, type OrderFilters } from '../schema';
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
} from '../handlers/orders';
import { eq } from 'drizzle-orm';

describe('Orders Handler', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Test data setup
  let testUserId: number;
  let testCategoryId: number;
  let testProductId: number;
  let testCouponId: number;

  const setupTestData = async () => {
    // Create test user
    const [user] = await db.insert(usersTable).values({
      email: 'test@example.com',
      password_hash: 'hashed_password',
      first_name: 'Test',
      last_name: 'User',
      role: 'customer'
    }).returning().execute();
    testUserId = user.id;

    // Create test category
    const [category] = await db.insert(categoriesTable).values({
      name: 'Software',
      description: 'Software products',
      slug: 'software'
    }).returning().execute();
    testCategoryId = category.id;

    // Create test product
    const [product] = await db.insert(productsTable).values({
      name: 'Test Software',
      description: 'A great software product',
      price: '99.99',
      category_id: testCategoryId,
      stock_quantity: 10
    }).returning().execute();
    testProductId = product.id;

    // Create test coupon
    const [coupon] = await db.insert(couponsTable).values({
      code: 'SAVE20',
      description: '20% off',
      discount_type: 'percentage',
      discount_value: '20.00',
      minimum_order: '50.00',
      usage_limit: 100,
      expires_at: new Date(Date.now() + 86400000) // Tomorrow
    }).returning().execute();
    testCouponId = coupon.id;
  };

  describe('createOrder', () => {
    beforeEach(setupTestData);

    const testOrderInput: CreateOrderInput = {
      user_id: 0, // Will be set in each test
      items: [
        {
          product_id: 0, // Will be set in each test
          quantity: 2,
          price: 99.99
        }
      ]
    };

    it('should create a new order successfully', async () => {
      const input = {
        ...testOrderInput,
        user_id: testUserId,
        items: [{ ...testOrderInput.items[0], product_id: testProductId }]
      };

      const result = await createOrder(input);

      expect(result.id).toBeDefined();
      expect(result.user_id).toEqual(testUserId);
      expect(result.order_number).toMatch(/^ORD-\d{4}-\d{6}$/);
      expect(result.status).toEqual('pending');
      expect(result.subtotal).toEqual(199.98); // 99.99 * 2
      expect(result.tax_amount).toBeCloseTo(19.998, 2); // 10% tax on subtotal
      expect(result.discount_amount).toEqual(0);
      expect(result.total_amount).toBeCloseTo(219.978, 2); // subtotal + tax
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should create order with coupon discount', async () => {
      const input = {
        ...testOrderInput,
        user_id: testUserId,
        items: [{ ...testOrderInput.items[0], product_id: testProductId }],
        coupon_code: 'SAVE20'
      };

      const result = await createOrder(input);

      expect(result.discount_amount).toBeCloseTo(39.996, 2); // 20% of 199.98
      expect(result.coupon_id).toEqual(testCouponId);
      // Tax on discounted amount: (199.98 - 39.996) * 0.10 = 15.9984
      expect(result.tax_amount).toBeCloseTo(15.9984, 2);
      // Total: 199.98 + 15.9984 - 39.996 = 175.9824
      expect(result.total_amount).toBeCloseTo(175.9824, 2);
    });

    it('should create order items in database', async () => {
      const input = {
        ...testOrderInput,
        user_id: testUserId,
        items: [{ ...testOrderInput.items[0], product_id: testProductId }]
      };

      const result = await createOrder(input);

      const orderItems = await db.select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.order_id, result.id))
        .execute();

      expect(orderItems).toHaveLength(1);
      expect(orderItems[0].product_id).toEqual(testProductId);
      expect(orderItems[0].quantity).toEqual(2);
      expect(parseFloat(orderItems[0].unit_price)).toEqual(99.99);
      expect(parseFloat(orderItems[0].total_price)).toEqual(199.98);
    });

    it('should update product stock quantities', async () => {
      const input = {
        ...testOrderInput,
        user_id: testUserId,
        items: [{ ...testOrderInput.items[0], product_id: testProductId, quantity: 3 }]
      };

      await createOrder(input);

      const [product] = await db.select()
        .from(productsTable)
        .where(eq(productsTable.id, testProductId))
        .execute();

      expect(product.stock_quantity).toEqual(7); // 10 - 3
    });

    it('should throw error for non-existent user', async () => {
      const input = {
        ...testOrderInput,
        user_id: 99999,
        items: [{ ...testOrderInput.items[0], product_id: testProductId }]
      };

      await expect(createOrder(input)).rejects.toThrow(/User not found/i);
    });

    it('should throw error for insufficient stock', async () => {
      const input = {
        ...testOrderInput,
        user_id: testUserId,
        items: [{ ...testOrderInput.items[0], product_id: testProductId, quantity: 15 }]
      };

      await expect(createOrder(input)).rejects.toThrow(/Insufficient stock/i);
    });

    it('should ignore expired coupon', async () => {
      // Create expired coupon
      const [expiredCoupon] = await db.insert(couponsTable).values({
        code: 'EXPIRED',
        description: 'Expired coupon',
        discount_type: 'percentage',
        discount_value: '50.00',
        expires_at: new Date(Date.now() - 86400000) // Yesterday
      }).returning().execute();

      const input = {
        ...testOrderInput,
        user_id: testUserId,
        items: [{ ...testOrderInput.items[0], product_id: testProductId }],
        coupon_code: 'EXPIRED'
      };

      const result = await createOrder(input);

      expect(result.discount_amount).toEqual(0);
      expect(result.coupon_id).toBeNull();
    });
  });

  describe('getOrders', () => {
    beforeEach(setupTestData);

    it('should return paginated orders', async () => {
      // Create test orders
      await createOrder({
        user_id: testUserId,
        items: [{ product_id: testProductId, quantity: 1, price: 99.99 }]
      });

      const result = await getOrders({ page: 1, limit: 10 });

      expect(result.orders).toHaveLength(1);
      expect(result.total).toEqual(1);
      expect(result.page).toEqual(1);
      expect(result.limit).toEqual(10);
      expect(typeof result.orders[0].subtotal).toBe('number');
    });

    it('should filter orders by status', async () => {
      const order = await createOrder({
        user_id: testUserId,
        items: [{ product_id: testProductId, quantity: 1, price: 99.99 }]
      });

      await updateOrderStatus(order.id, 'paid');

      const filters: OrderFilters = {
        status: 'paid',
        page: 1,
        limit: 10
      };

      const result = await getOrders(filters);

      expect(result.orders).toHaveLength(1);
      expect(result.orders[0].status).toEqual('paid');
    });

    it('should filter orders by user', async () => {
      await createOrder({
        user_id: testUserId,
        items: [{ product_id: testProductId, quantity: 1, price: 99.99 }]
      });

      const filters: OrderFilters = {
        user_id: testUserId,
        page: 1,
        limit: 10
      };

      const result = await getOrders(filters);

      expect(result.orders).toHaveLength(1);
      expect(result.orders[0].user_id).toEqual(testUserId);
    });

    it('should filter orders by date range', async () => {
      await createOrder({
        user_id: testUserId,
        items: [{ product_id: testProductId, quantity: 1, price: 99.99 }]
      });

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const filters: OrderFilters = {
        date_from: yesterday,
        date_to: tomorrow,
        page: 1,
        limit: 10
      };

      const result = await getOrders(filters);

      expect(result.orders).toHaveLength(1);
    });

    it('should return empty results for no matches', async () => {
      const filters: OrderFilters = {
        status: 'cancelled',
        page: 1,
        limit: 10
      };

      const result = await getOrders(filters);

      expect(result.orders).toHaveLength(0);
      expect(result.total).toEqual(0);
    });
  });

  describe('getOrdersByUser', () => {
    beforeEach(setupTestData);

    it('should return orders for specific user', async () => {
      await createOrder({
        user_id: testUserId,
        items: [{ product_id: testProductId, quantity: 1, price: 99.99 }]
      });

      const result = await getOrdersByUser(testUserId);

      expect(result).toHaveLength(1);
      expect(result[0].user_id).toEqual(testUserId);
      expect(typeof result[0].total_amount).toBe('number');
    });

    it('should return empty array for user with no orders', async () => {
      const result = await getOrdersByUser(99999);

      expect(result).toHaveLength(0);
    });
  });

  describe('getOrderById', () => {
    beforeEach(setupTestData);

    it('should return order with items', async () => {
      const order = await createOrder({
        user_id: testUserId,
        items: [{ product_id: testProductId, quantity: 2, price: 99.99 }]
      });

      const result = await getOrderById(order.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(order.id);
      expect(result!.items).toHaveLength(1);
      expect(result!.items[0].product_id).toEqual(testProductId);
      expect(result!.items[0].quantity).toEqual(2);
      expect(typeof result!.items[0].unit_price).toBe('number');
      expect(typeof result!.items[0].total_price).toBe('number');
    });

    it('should return null for non-existent order', async () => {
      const result = await getOrderById(99999);

      expect(result).toBeNull();
    });
  });

  describe('updateOrderStatus', () => {
    beforeEach(setupTestData);

    it('should update order status successfully', async () => {
      const order = await createOrder({
        user_id: testUserId,
        items: [{ product_id: testProductId, quantity: 1, price: 99.99 }]
      });

      const result = await updateOrderStatus(order.id, 'paid');

      expect(result).not.toBeNull();
      expect(result!.status).toEqual('paid');
      expect(result!.updated_at).toBeInstanceOf(Date);
    });

    it('should generate license keys when status is paid', async () => {
      const order = await createOrder({
        user_id: testUserId,
        items: [{ product_id: testProductId, quantity: 1, price: 99.99 }]
      });

      await updateOrderStatus(order.id, 'paid');

      const orderItems = await db.select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.order_id, order.id))
        .execute();

      expect(orderItems[0].license_key).not.toBeNull();
      expect(orderItems[0].license_key).toMatch(/^LIC-/);
      expect(orderItems[0].download_expires_at).toBeInstanceOf(Date);
    });

    it('should return null for non-existent order', async () => {
      const result = await updateOrderStatus(99999, 'paid');

      expect(result).toBeNull();
    });
  });

  describe('processOrderPayment', () => {
    beforeEach(setupTestData);

    it('should process payment successfully', async () => {
      const order = await createOrder({
        user_id: testUserId,
        items: [{ product_id: testProductId, quantity: 1, price: 99.99 }]
      });

      const result = await processOrderPayment(order.id, 'credit_card', 'PAY-123456');

      expect(result.success).toBe(true);
      expect(result.order).toBeDefined();
      expect(result.order!.status).toEqual('paid');
      expect(result.order!.payment_method).toEqual('credit_card');
      expect(result.order!.payment_reference).toEqual('PAY-123456');
    });

    it('should fail for non-existent order', async () => {
      const result = await processOrderPayment(99999, 'credit_card', 'PAY-123456');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Order not found/i);
    });

    it('should fail for non-pending order', async () => {
      const order = await createOrder({
        user_id: testUserId,
        items: [{ product_id: testProductId, quantity: 1, price: 99.99 }]
      });

      await updateOrderStatus(order.id, 'paid');

      const result = await processOrderPayment(order.id, 'credit_card', 'PAY-123456');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not pending payment/i);
    });
  });

  describe('generateLicenseKeys', () => {
    beforeEach(setupTestData);

    it('should generate license keys for order items', async () => {
      const order = await createOrder({
        user_id: testUserId,
        items: [{ product_id: testProductId, quantity: 2, price: 99.99 }]
      });

      const success = await generateLicenseKeys(order.id);

      expect(success).toBe(true);

      const orderItems = await db.select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.order_id, order.id))
        .execute();

      expect(orderItems[0].license_key).not.toBeNull();
      expect(orderItems[0].license_key).toMatch(/^LIC-/);
      expect(orderItems[0].download_expires_at).toBeInstanceOf(Date);
    });

    it('should return true for orders with no items needing keys', async () => {
      const order = await createOrder({
        user_id: testUserId,
        items: [{ product_id: testProductId, quantity: 1, price: 99.99 }]
      });

      // Generate keys first time
      await generateLicenseKeys(order.id);

      // Try to generate again - should return true but not change anything
      const success = await generateLicenseKeys(order.id);

      expect(success).toBe(true);
    });
  });

  describe('getOrderStatistics', () => {
    beforeEach(setupTestData);

    it('should return order statistics', async () => {
      // Create orders with different statuses
      const order1 = await createOrder({
        user_id: testUserId,
        items: [{ product_id: testProductId, quantity: 1, price: 99.99 }]
      });

      const order2 = await createOrder({
        user_id: testUserId,
        items: [{ product_id: testProductId, quantity: 1, price: 99.99 }]
      });

      await updateOrderStatus(order1.id, 'paid');
      await updateOrderStatus(order2.id, 'completed');

      const stats = await getOrderStatistics();

      expect(stats.total_orders).toEqual(2);
      expect(stats.pending_orders).toEqual(0);
      expect(stats.completed_orders).toEqual(1);
      expect(typeof stats.total_revenue).toBe('number');
      expect(typeof stats.monthly_revenue).toBe('number');
    });

    it('should return zero values when no orders exist', async () => {
      const stats = await getOrderStatistics();

      expect(stats.total_orders).toEqual(0);
      expect(stats.pending_orders).toEqual(0);
      expect(stats.completed_orders).toEqual(0);
      expect(stats.total_revenue).toEqual(0);
      expect(stats.monthly_revenue).toEqual(0);
    });
  });

  describe('refundOrder', () => {
    beforeEach(setupTestData);

    it('should refund a paid order successfully', async () => {
      const order = await createOrder({
        user_id: testUserId,
        items: [{ product_id: testProductId, quantity: 2, price: 99.99 }]
      });

      await updateOrderStatus(order.id, 'paid');

      const result = await refundOrder(order.id, 'Customer request');

      expect(result.success).toBe(true);

      // Check order status was updated
      const updatedOrder = await getOrderById(order.id);
      expect(updatedOrder!.status).toEqual('refunded');

      // Check license keys were invalidated
      const orderItems = await db.select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.order_id, order.id))
        .execute();

      expect(orderItems[0].license_key).toBeNull();
      expect(orderItems[0].download_expires_at).toBeNull();

      // Check stock was restored
      const [product] = await db.select()
        .from(productsTable)
        .where(eq(productsTable.id, testProductId))
        .execute();

      expect(product.stock_quantity).toEqual(10); // Back to original 10
    });

    it('should fail for non-existent order', async () => {
      const result = await refundOrder(99999);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Order not found/i);
    });

    it('should fail for non-refundable order', async () => {
      const order = await createOrder({
        user_id: testUserId,
        items: [{ product_id: testProductId, quantity: 1, price: 99.99 }]
      });

      // Keep order in pending status (not refundable)
      const result = await refundOrder(order.id);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/cannot be refunded/i);
    });
  });
});