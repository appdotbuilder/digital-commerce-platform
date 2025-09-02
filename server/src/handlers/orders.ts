import { db } from '../db';
import { ordersTable, orderItemsTable, usersTable, productsTable, couponsTable } from '../db/schema';
import { type CreateOrderInput, type Order, type OrderItem, type OrderFilters } from '../schema';
import { eq, and, gte, lte, desc, count, sum, SQL, isNull, inArray } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * Handler for creating a new order
 * This handler creates a new order with items and calculates totals
 */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  try {
    // Validate user exists
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .limit(1)
      .execute();

    if (user.length === 0) {
      throw new Error('User not found');
    }

    // Validate all products exist and get their details
    const productIds = input.items.map(item => item.product_id);
    const products = await db.select()
      .from(productsTable)
      .where(and(
        eq(productsTable.is_active, true),
        inArray(productsTable.id, productIds)
      ))
      .execute();

    if (products.length !== productIds.length) {
      throw new Error('One or more products not found or inactive');
    }

    // Check stock availability
    for (const item of input.items) {
      const product = products.find(p => p.id === item.product_id);
      if (!product) continue;
      
      if (product.stock_quantity < item.quantity) {
        throw new Error(`Insufficient stock for product ${product.name}`);
      }
    }

    // Calculate subtotal
    const subtotal = input.items.reduce((sum, item) => {
      const product = products.find(p => p.id === item.product_id);
      if (!product) return sum;
      return sum + (parseFloat(product.price) * item.quantity);
    }, 0);

    let couponId: number | null = null;
    let discountAmount = 0;

    // Apply coupon if provided
    if (input.coupon_code) {
      const coupon = await db.select()
        .from(couponsTable)
        .where(and(
          eq(couponsTable.code, input.coupon_code),
          eq(couponsTable.is_active, true)
        ))
        .limit(1)
        .execute();

      if (coupon.length > 0) {
        const couponData = coupon[0];
        const now = new Date();
        
        // Check if coupon is not expired
        if (!couponData.expires_at || couponData.expires_at > now) {
          // Check usage limit
          if (!couponData.usage_limit || couponData.used_count < couponData.usage_limit) {
            // Check minimum order requirement
            if (!couponData.minimum_order || subtotal >= parseFloat(couponData.minimum_order)) {
              couponId = couponData.id;
              
              if (couponData.discount_type === 'percentage') {
                discountAmount = (subtotal * parseFloat(couponData.discount_value)) / 100;
              } else {
                discountAmount = Math.min(parseFloat(couponData.discount_value), subtotal);
              }
            }
          }
        }
      }
    }

    // Calculate tax (simple 10% tax rate)
    const taxRate = 0.10;
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = taxableAmount * taxRate;
    const totalAmount = subtotal + taxAmount - discountAmount;

    // Generate unique order number
    const orderNumber = `ORD-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    // Start transaction
    const result = await db.transaction(async (tx) => {
      // Create order
      const [newOrder] = await tx.insert(ordersTable)
        .values({
          user_id: input.user_id,
          order_number: orderNumber,
          status: 'pending',
          subtotal: subtotal.toString(),
          tax_amount: taxAmount.toString(),
          discount_amount: discountAmount.toString(),
          total_amount: totalAmount.toString(),
          coupon_id: couponId,
          payment_method: null,
          payment_reference: null
        })
        .returning()
        .execute();

      // Create order items
      const orderItems = input.items.map(item => {
        const product = products.find(p => p.id === item.product_id)!;
        const unitPrice = parseFloat(product.price);
        const totalPrice = unitPrice * item.quantity;
        
        return {
          order_id: newOrder.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: unitPrice.toString(),
          total_price: totalPrice.toString(),
          license_key: null,
          download_expires_at: null
        };
      });

      await tx.insert(orderItemsTable)
        .values(orderItems)
        .execute();

      // Update coupon usage count if coupon was used
      if (couponId) {
        const [currentCoupon] = await tx.select()
          .from(couponsTable)
          .where(eq(couponsTable.id, couponId))
          .execute();
        
        await tx.update(couponsTable)
          .set({ used_count: currentCoupon.used_count + 1 })
          .where(eq(couponsTable.id, couponId))
          .execute();
      }

      // Update product stock quantities
      for (const item of input.items) {
        const product = products.find(p => p.id === item.product_id)!;
        await tx.update(productsTable)
          .set({ stock_quantity: product.stock_quantity - item.quantity })
          .where(eq(productsTable.id, item.product_id))
          .execute();
      }

      return newOrder;
    });

    // Convert numeric fields back to numbers
    return {
      ...result,
      subtotal: parseFloat(result.subtotal),
      tax_amount: parseFloat(result.tax_amount),
      discount_amount: parseFloat(result.discount_amount),
      total_amount: parseFloat(result.total_amount)
    };

  } catch (error) {
    console.error('Order creation failed:', error);
    throw error;
  }
}

/**
 * Handler for getting all orders with filters
 * This handler retrieves orders with pagination and filtering for admin
 */
export async function getOrders(filters: OrderFilters = { page: 1, limit: 10 }): Promise<{ orders: Order[], total: number, page: number, limit: number }> {
  try {
    // Build conditions array
    const conditions: SQL<unknown>[] = [];

    if (filters.status) {
      conditions.push(eq(ordersTable.status, filters.status));
    }

    if (filters.user_id) {
      conditions.push(eq(ordersTable.user_id, filters.user_id));
    }

    if (filters.date_from) {
      conditions.push(gte(ordersTable.created_at, filters.date_from));
    }

    if (filters.date_to) {
      conditions.push(lte(ordersTable.created_at, filters.date_to));
    }

    // Execute query with proper conditional logic
    const whereClause = conditions.length > 0 
      ? (conditions.length === 1 ? conditions[0] : and(...conditions))
      : undefined;

    const orders = await (whereClause 
      ? db.select().from(ordersTable).where(whereClause)
      : db.select().from(ordersTable)
    )
      .orderBy(desc(ordersTable.created_at))
      .limit(filters.limit)
      .offset((filters.page - 1) * filters.limit)
      .execute();

    // Get total count for pagination
    const [{ count: totalCount }] = await (whereClause
      ? db.select({ count: count() }).from(ordersTable).where(whereClause)
      : db.select({ count: count() }).from(ordersTable)
    ).execute();

    // Convert numeric fields
    const ordersWithNumbers = orders.map(order => ({
      ...order,
      subtotal: parseFloat(order.subtotal),
      tax_amount: parseFloat(order.tax_amount),
      discount_amount: parseFloat(order.discount_amount),
      total_amount: parseFloat(order.total_amount)
    }));

    return {
      orders: ordersWithNumbers,
      total: totalCount,
      page: filters.page,
      limit: filters.limit
    };

  } catch (error) {
    console.error('Failed to get orders:', error);
    throw error;
  }
}

/**
 * Handler for getting orders by user ID
 * This handler retrieves all orders for a specific user
 */
export async function getOrdersByUser(userId: number): Promise<Order[]> {
  try {
    const orders = await db.select()
      .from(ordersTable)
      .where(eq(ordersTable.user_id, userId))
      .orderBy(desc(ordersTable.created_at))
      .execute();

    // Convert numeric fields
    return orders.map(order => ({
      ...order,
      subtotal: parseFloat(order.subtotal),
      tax_amount: parseFloat(order.tax_amount),
      discount_amount: parseFloat(order.discount_amount),
      total_amount: parseFloat(order.total_amount)
    }));

  } catch (error) {
    console.error('Failed to get orders by user:', error);
    throw error;
  }
}

/**
 * Handler for getting a single order by ID
 * This handler retrieves a specific order with all details
 */
export async function getOrderById(id: number): Promise<(Order & { items: OrderItem[] }) | null> {
  try {
    const orders = await db.select()
      .from(ordersTable)
      .where(eq(ordersTable.id, id))
      .limit(1)
      .execute();

    if (orders.length === 0) {
      return null;
    }

    const order = orders[0];

    // Get order items
    const items = await db.select()
      .from(orderItemsTable)
      .where(eq(orderItemsTable.order_id, id))
      .execute();

    // Convert numeric fields
    const orderWithNumbers = {
      ...order,
      subtotal: parseFloat(order.subtotal),
      tax_amount: parseFloat(order.tax_amount),
      discount_amount: parseFloat(order.discount_amount),
      total_amount: parseFloat(order.total_amount)
    };

    const itemsWithNumbers = items.map(item => ({
      ...item,
      unit_price: parseFloat(item.unit_price),
      total_price: parseFloat(item.total_price)
    }));

    return {
      ...orderWithNumbers,
      items: itemsWithNumbers
    };

  } catch (error) {
    console.error('Failed to get order by ID:', error);
    throw error;
  }
}

/**
 * Handler for updating order status
 * This handler updates the status of an order
 */
export async function updateOrderStatus(id: number, status: Order['status']): Promise<Order | null> {
  try {
    const result = await db.update(ordersTable)
      .set({ 
        status,
        updated_at: new Date()
      })
      .where(eq(ordersTable.id, id))
      .returning()
      .execute();

    if (result.length === 0) {
      return null;
    }

    // Generate license keys if status is 'paid'
    if (status === 'paid') {
      await generateLicenseKeys(id);
    }

    // Convert numeric fields
    const order = result[0];
    return {
      ...order,
      subtotal: parseFloat(order.subtotal),
      tax_amount: parseFloat(order.tax_amount),
      discount_amount: parseFloat(order.discount_amount),
      total_amount: parseFloat(order.total_amount)
    };

  } catch (error) {
    console.error('Failed to update order status:', error);
    throw error;
  }
}

/**
 * Handler for processing order payment
 * This handler processes payment and updates order accordingly
 */
export async function processOrderPayment(orderId: number, paymentMethod: string, paymentReference: string): Promise<{ success: boolean, order?: Order, error?: string }> {
  try {
    // Get order and validate it's pending
    const orders = await db.select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1)
      .execute();

    if (orders.length === 0) {
      return { success: false, error: 'Order not found' };
    }

    const order = orders[0];
    if (order.status !== 'pending') {
      return { success: false, error: 'Order is not pending payment' };
    }

    // Update order with payment details and status
    const result = await db.update(ordersTable)
      .set({
        status: 'paid',
        payment_method: paymentMethod,
        payment_reference: paymentReference,
        updated_at: new Date()
      })
      .where(eq(ordersTable.id, orderId))
      .returning()
      .execute();

    if (result.length === 0) {
      return { success: false, error: 'Failed to update order' };
    }

    // Generate license keys
    await generateLicenseKeys(orderId);

    const updatedOrder = result[0];
    return {
      success: true,
      order: {
        ...updatedOrder,
        subtotal: parseFloat(updatedOrder.subtotal),
        tax_amount: parseFloat(updatedOrder.tax_amount),
        discount_amount: parseFloat(updatedOrder.discount_amount),
        total_amount: parseFloat(updatedOrder.total_amount)
      }
    };

  } catch (error) {
    console.error('Payment processing failed:', error);
    return { success: false, error: 'Payment processing failed' };
  }
}

/**
 * Handler for generating license keys for order items
 * This handler generates license keys for digital products after payment
 */
export async function generateLicenseKeys(orderId: number): Promise<boolean> {
  try {
    // Get order items that don't have license keys yet
    const items = await db.select()
      .from(orderItemsTable)
      .innerJoin(productsTable, eq(orderItemsTable.product_id, productsTable.id))
      .where(and(
        eq(orderItemsTable.order_id, orderId),
        isNull(orderItemsTable.license_key)
      ))
      .execute();

    if (items.length === 0) {
      return true; // No items need license keys
    }

    // Generate license keys for each item
    for (const item of items) {
      const licenseKey = `LIC-${crypto.randomUUID().toUpperCase()}`;
      const downloadExpiresAt = new Date();
      downloadExpiresAt.setDate(downloadExpiresAt.getDate() + 30); // 30 days from now

      await db.update(orderItemsTable)
        .set({
          license_key: licenseKey,
          download_expires_at: downloadExpiresAt
        })
        .where(eq(orderItemsTable.id, item.order_items.id))
        .execute();
    }

    return true;

  } catch (error) {
    console.error('Failed to generate license keys:', error);
    return false;
  }
}

/**
 * Handler for getting order statistics
 * This handler retrieves order statistics for dashboard
 */
export async function getOrderStatistics(): Promise<{
  total_orders: number;
  pending_orders: number;
  completed_orders: number;
  total_revenue: number;
  monthly_revenue: number;
}> {
  try {
    // Get total orders count
    const [totalOrdersResult] = await db.select({ count: count() })
      .from(ordersTable)
      .execute();

    // Get pending orders count
    const [pendingOrdersResult] = await db.select({ count: count() })
      .from(ordersTable)
      .where(eq(ordersTable.status, 'pending'))
      .execute();

    // Get completed orders count
    const [completedOrdersResult] = await db.select({ count: count() })
      .from(ordersTable)
      .where(eq(ordersTable.status, 'completed'))
      .execute();

    // Get total revenue from paid/completed orders
    const [totalRevenueResult] = await db.select({ 
      revenue: sum(ordersTable.total_amount) 
    })
      .from(ordersTable)
      .where(and(
        eq(ordersTable.status, 'paid')
      ))
      .execute();

    // Get monthly revenue (current month)
    const currentMonth = new Date();
    currentMonth.setDate(1); // First day of current month
    const nextMonth = new Date(currentMonth);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const [monthlyRevenueResult] = await db.select({ 
      revenue: sum(ordersTable.total_amount) 
    })
      .from(ordersTable)
      .where(and(
        eq(ordersTable.status, 'paid'),
        gte(ordersTable.created_at, currentMonth),
        lte(ordersTable.created_at, nextMonth)
      ))
      .execute();

    return {
      total_orders: totalOrdersResult.count,
      pending_orders: pendingOrdersResult.count,
      completed_orders: completedOrdersResult.count,
      total_revenue: totalRevenueResult.revenue ? parseFloat(totalRevenueResult.revenue) : 0,
      monthly_revenue: monthlyRevenueResult.revenue ? parseFloat(monthlyRevenueResult.revenue) : 0
    };

  } catch (error) {
    console.error('Failed to get order statistics:', error);
    throw error;
  }
}

/**
 * Handler for refunding an order
 * This handler processes order refunds
 */
export async function refundOrder(orderId: number, reason?: string): Promise<{ success: boolean, error?: string }> {
  try {
    // Get order and validate it can be refunded
    const orders = await db.select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1)
      .execute();

    if (orders.length === 0) {
      return { success: false, error: 'Order not found' };
    }

    const order = orders[0];
    if (order.status !== 'paid' && order.status !== 'completed') {
      return { success: false, error: 'Order cannot be refunded' };
    }

    // Start transaction
    await db.transaction(async (tx) => {
      // Update order status to refunded
      await tx.update(ordersTable)
        .set({
          status: 'refunded',
          updated_at: new Date()
        })
        .where(eq(ordersTable.id, orderId))
        .execute();

      // Invalidate license keys by setting them to null
      await tx.update(orderItemsTable)
        .set({
          license_key: null,
          download_expires_at: null
        })
        .where(eq(orderItemsTable.order_id, orderId))
        .execute();

      // Restore product stock quantities
      const orderItems = await tx.select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.order_id, orderId))
        .execute();

      for (const item of orderItems) {
        const [product] = await tx.select()
          .from(productsTable)
          .where(eq(productsTable.id, item.product_id))
          .limit(1)
          .execute();

        if (product) {
          await tx.update(productsTable)
            .set({ stock_quantity: product.stock_quantity + item.quantity })
            .where(eq(productsTable.id, item.product_id))
            .execute();
        }
      }
    });

    return { success: true };

  } catch (error) {
    console.error('Refund processing failed:', error);
    return { success: false, error: 'Refund processing failed' };
  }
}