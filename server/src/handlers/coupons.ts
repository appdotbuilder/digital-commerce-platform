import { db } from '../db';
import { couponsTable, ordersTable } from '../db/schema';
import { type CreateCouponInput, type UpdateCouponInput, type Coupon } from '../schema';
import { eq, and, isNull, or, gt, desc, lte, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

/**
 * Handler for creating a new discount coupon
 * This handler creates a new coupon with validation rules
 */
export async function createCoupon(input: CreateCouponInput): Promise<Coupon> {
  try {
    // Check if coupon code already exists
    const existingCoupon = await db.select()
      .from(couponsTable)
      .where(eq(couponsTable.code, input.code))
      .limit(1)
      .execute();

    if (existingCoupon.length > 0) {
      throw new Error('Coupon code already exists');
    }

    // Validate discount value based on type
    if (input.discount_type === 'percentage' && input.discount_value > 100) {
      throw new Error('Percentage discount cannot exceed 100%');
    }

    if (input.discount_value <= 0) {
      throw new Error('Discount value must be greater than 0');
    }

    // Insert coupon into database
    const result = await db.insert(couponsTable)
      .values({
        code: input.code,
        description: input.description,
        discount_type: input.discount_type,
        discount_value: input.discount_value.toString(),
        minimum_order: input.minimum_order ? input.minimum_order.toString() : null,
        usage_limit: input.usage_limit,
        expires_at: input.expires_at
      })
      .returning()
      .execute();

    // Convert numeric fields back to numbers before returning
    const coupon = result[0];
    return {
      ...coupon,
      discount_value: parseFloat(coupon.discount_value),
      minimum_order: coupon.minimum_order ? parseFloat(coupon.minimum_order) : null
    };
  } catch (error) {
    console.error('Coupon creation failed:', error);
    throw error;
  }
}

/**
 * Handler for getting all coupons
 * This handler retrieves all coupons for admin management
 */
export async function getCoupons(): Promise<Coupon[]> {
  try {
    const results = await db.select()
      .from(couponsTable)
      .orderBy(desc(couponsTable.created_at))
      .execute();

    return results.map(coupon => ({
      ...coupon,
      discount_value: parseFloat(coupon.discount_value),
      minimum_order: coupon.minimum_order ? parseFloat(coupon.minimum_order) : null
    }));
  } catch (error) {
    console.error('Failed to fetch coupons:', error);
    throw error;
  }
}

/**
 * Handler for getting active coupons
 * This handler retrieves only active and non-expired coupons
 */
export async function getActiveCoupons(): Promise<Coupon[]> {
  try {
    const now = new Date();
    
    const conditions: SQL<unknown>[] = [
      eq(couponsTable.is_active, true)
    ];

    // Add expiration check - coupon is valid if expires_at is null OR expires_at > now
    const expirationCondition = or(
      isNull(couponsTable.expires_at),
      gt(couponsTable.expires_at, now)
    );
    
    if (expirationCondition) {
      conditions.push(expirationCondition);
    }

    const results = await db.select()
      .from(couponsTable)
      .where(and(...conditions))
      .orderBy(desc(couponsTable.created_at))
      .execute();

    // Filter out coupons that have reached usage limit
    const availableCoupons = results.filter(coupon => {
      if (coupon.usage_limit === null) return true;
      return coupon.used_count < coupon.usage_limit;
    });

    return availableCoupons.map(coupon => ({
      ...coupon,
      discount_value: parseFloat(coupon.discount_value),
      minimum_order: coupon.minimum_order ? parseFloat(coupon.minimum_order) : null
    }));
  } catch (error) {
    console.error('Failed to fetch active coupons:', error);
    throw error;
  }
}

/**
 * Handler for validating a coupon code
 * This handler checks if a coupon code is valid for use
 */
export async function validateCoupon(code: string, orderTotal: number): Promise<{ isValid: boolean, coupon?: Coupon, discount?: number, error?: string }> {
  try {
    // Find coupon by code
    const results = await db.select()
      .from(couponsTable)
      .where(eq(couponsTable.code, code))
      .limit(1)
      .execute();

    if (results.length === 0) {
      return { isValid: false, error: 'Coupon not found' };
    }

    const couponData = results[0];
    const coupon: Coupon = {
      ...couponData,
      discount_value: parseFloat(couponData.discount_value),
      minimum_order: couponData.minimum_order ? parseFloat(couponData.minimum_order) : null
    };

    // Check if coupon is active
    if (!coupon.is_active) {
      return { isValid: false, error: 'Coupon is not active' };
    }

    // Check if coupon is expired
    if (coupon.expires_at && new Date() > coupon.expires_at) {
      return { isValid: false, error: 'Coupon has expired' };
    }

    // Check usage limits
    if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
      return { isValid: false, error: 'Coupon usage limit reached' };
    }

    // Check minimum order amount
    if (coupon.minimum_order !== null && orderTotal < coupon.minimum_order) {
      return { 
        isValid: false, 
        error: `Minimum order amount of $${coupon.minimum_order.toFixed(2)} required` 
      };
    }

    // Calculate discount amount
    let discount: number;
    if (coupon.discount_type === 'percentage') {
      discount = (orderTotal * coupon.discount_value) / 100;
    } else {
      discount = coupon.discount_value;
    }

    // Ensure discount doesn't exceed order total
    discount = Math.min(discount, orderTotal);

    return {
      isValid: true,
      coupon,
      discount
    };
  } catch (error) {
    console.error('Coupon validation failed:', error);
    return { isValid: false, error: 'Validation failed' };
  }
}

/**
 * Handler for applying a coupon to an order
 * This handler applies a coupon and updates usage count
 */
export async function applyCoupon(code: string, orderId: number): Promise<{ success: boolean, discount?: number, error?: string }> {
  try {
    // Get the order to validate total amount
    const orderResults = await db.select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1)
      .execute();

    if (orderResults.length === 0) {
      return { success: false, error: 'Order not found' };
    }

    const order = orderResults[0];
    const orderTotal = parseFloat(order.subtotal);

    // Validate the coupon
    const validation = await validateCoupon(code, orderTotal);
    if (!validation.isValid || !validation.coupon || validation.discount === undefined) {
      return { success: false, error: validation.error };
    }

    // Update coupon usage count
    await db.update(couponsTable)
      .set({ 
        used_count: validation.coupon.used_count + 1,
        updated_at: new Date()
      })
      .where(eq(couponsTable.id, validation.coupon.id))
      .execute();

    // Update order with coupon ID and discount
    await db.update(ordersTable)
      .set({
        coupon_id: validation.coupon.id,
        discount_amount: validation.discount.toString(),
        total_amount: (orderTotal - validation.discount).toString(),
        updated_at: new Date()
      })
      .where(eq(ordersTable.id, orderId))
      .execute();

    return {
      success: true,
      discount: validation.discount
    };
  } catch (error) {
    console.error('Coupon application failed:', error);
    return { success: false, error: 'Application failed' };
  }
}

/**
 * Handler for getting a single coupon by ID
 * This handler retrieves a specific coupon by its ID
 */
export async function getCouponById(id: number): Promise<Coupon | null> {
  try {
    const results = await db.select()
      .from(couponsTable)
      .where(eq(couponsTable.id, id))
      .limit(1)
      .execute();

    if (results.length === 0) {
      return null;
    }

    const coupon = results[0];
    return {
      ...coupon,
      discount_value: parseFloat(coupon.discount_value),
      minimum_order: coupon.minimum_order ? parseFloat(coupon.minimum_order) : null
    };
  } catch (error) {
    console.error('Failed to fetch coupon by ID:', error);
    throw error;
  }
}

/**
 * Handler for updating a coupon
 * This handler updates an existing coupon with new data
 */
export async function updateCoupon(input: UpdateCouponInput): Promise<Coupon | null> {
  try {
    // Check if coupon exists
    const existingResults = await db.select()
      .from(couponsTable)
      .where(eq(couponsTable.id, input.id))
      .limit(1)
      .execute();

    if (existingResults.length === 0) {
      return null;
    }

    // If code is being changed, check for uniqueness
    if (input.code) {
      const codeCheckResults = await db.select()
        .from(couponsTable)
        .where(and(
          eq(couponsTable.code, input.code),
          gt(couponsTable.id, 0) // Ensure we're not comparing with itself
        ))
        .execute();

      const existingWithSameCode = codeCheckResults.filter(c => c.id !== input.id);
      if (existingWithSameCode.length > 0) {
        throw new Error('Coupon code already exists');
      }
    }

    // Validate discount value if provided
    if (input.discount_value !== undefined) {
      if (input.discount_type === 'percentage' && input.discount_value > 100) {
        throw new Error('Percentage discount cannot exceed 100%');
      }
      if (input.discount_value <= 0) {
        throw new Error('Discount value must be greater than 0');
      }
    }

    // Prepare update data
    const updateData: any = {
      updated_at: new Date()
    };

    if (input.code !== undefined) updateData.code = input.code;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.discount_type !== undefined) updateData.discount_type = input.discount_type;
    if (input.discount_value !== undefined) updateData.discount_value = input.discount_value.toString();
    if (input.minimum_order !== undefined) updateData.minimum_order = input.minimum_order ? input.minimum_order.toString() : null;
    if (input.usage_limit !== undefined) updateData.usage_limit = input.usage_limit;
    if (input.expires_at !== undefined) updateData.expires_at = input.expires_at;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;

    // Update coupon in database
    const results = await db.update(couponsTable)
      .set(updateData)
      .where(eq(couponsTable.id, input.id))
      .returning()
      .execute();

    if (results.length === 0) {
      return null;
    }

    // Convert numeric fields back to numbers before returning
    const coupon = results[0];
    return {
      ...coupon,
      discount_value: parseFloat(coupon.discount_value),
      minimum_order: coupon.minimum_order ? parseFloat(coupon.minimum_order) : null
    };
  } catch (error) {
    console.error('Coupon update failed:', error);
    throw error;
  }
}

/**
 * Handler for deleting a coupon
 * This handler removes a coupon from the database
 */
export async function deleteCoupon(id: number): Promise<boolean> {
  try {
    // Check if coupon exists
    const existingResults = await db.select()
      .from(couponsTable)
      .where(eq(couponsTable.id, id))
      .limit(1)
      .execute();

    if (existingResults.length === 0) {
      return false;
    }

    // Check if coupon has been used in orders
    const orderResults = await db.select()
      .from(ordersTable)
      .where(eq(ordersTable.coupon_id, id))
      .limit(1)
      .execute();

    if (orderResults.length > 0) {
      // If coupon has been used, soft delete by deactivating
      await db.update(couponsTable)
        .set({ 
          is_active: false,
          updated_at: new Date()
        })
        .where(eq(couponsTable.id, id))
        .execute();
    } else {
      // If not used, hard delete
      await db.delete(couponsTable)
        .where(eq(couponsTable.id, id))
        .execute();
    }

    return true;
  } catch (error) {
    console.error('Coupon deletion failed:', error);
    throw error;
  }
}