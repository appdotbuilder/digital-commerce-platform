import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { couponsTable, usersTable, ordersTable } from '../db/schema';
import { type CreateCouponInput, type UpdateCouponInput } from '../schema';
import { 
  createCoupon, 
  getCoupons, 
  getActiveCoupons, 
  validateCoupon, 
  applyCoupon, 
  getCouponById, 
  updateCoupon, 
  deleteCoupon 
} from '../handlers/coupons';
import { eq } from 'drizzle-orm';

// Test data
const testPercentageCoupon: CreateCouponInput = {
  code: 'SAVE20',
  description: 'Save 20% on your order',
  discount_type: 'percentage',
  discount_value: 20,
  minimum_order: 50,
  usage_limit: 100,
  expires_at: null
};

const testFixedCoupon: CreateCouponInput = {
  code: 'FIXED10',
  description: 'Save $10 on your order',
  discount_type: 'fixed',
  discount_value: 10,
  minimum_order: null,
  usage_limit: null,
  expires_at: null
};

const testExpiredCoupon: CreateCouponInput = {
  code: 'EXPIRED',
  description: 'Expired coupon',
  discount_type: 'percentage',
  discount_value: 15,
  minimum_order: null,
  usage_limit: null,
  expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000) // Yesterday
};

describe('Coupons Handler', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createCoupon', () => {
    it('should create a percentage coupon', async () => {
      const result = await createCoupon(testPercentageCoupon);

      expect(result.code).toEqual('SAVE20');
      expect(result.description).toEqual(testPercentageCoupon.description);
      expect(result.discount_type).toEqual('percentage');
      expect(result.discount_value).toEqual(20);
      expect(typeof result.discount_value).toBe('number');
      expect(result.minimum_order).toEqual(50);
      expect(typeof result.minimum_order).toBe('number');
      expect(result.usage_limit).toEqual(100);
      expect(result.used_count).toEqual(0);
      expect(result.is_active).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should create a fixed discount coupon', async () => {
      const result = await createCoupon(testFixedCoupon);

      expect(result.code).toEqual('FIXED10');
      expect(result.discount_type).toEqual('fixed');
      expect(result.discount_value).toEqual(10);
      expect(result.minimum_order).toBeNull();
      expect(result.usage_limit).toBeNull();
    });

    it('should save coupon to database', async () => {
      const result = await createCoupon(testPercentageCoupon);

      const coupons = await db.select()
        .from(couponsTable)
        .where(eq(couponsTable.id, result.id))
        .execute();

      expect(coupons).toHaveLength(1);
      expect(coupons[0].code).toEqual('SAVE20');
      expect(parseFloat(coupons[0].discount_value)).toEqual(20);
    });

    it('should reject duplicate coupon codes', async () => {
      await createCoupon(testPercentageCoupon);

      await expect(createCoupon(testPercentageCoupon))
        .rejects.toThrow(/already exists/i);
    });

    it('should reject percentage discount over 100%', async () => {
      const invalidCoupon = {
        ...testPercentageCoupon,
        code: 'INVALID',
        discount_value: 150
      };

      await expect(createCoupon(invalidCoupon))
        .rejects.toThrow(/cannot exceed 100%/i);
    });

    it('should reject zero or negative discount values', async () => {
      const zeroCoupon = {
        ...testPercentageCoupon,
        code: 'ZERO',
        discount_value: 0
      };

      await expect(createCoupon(zeroCoupon))
        .rejects.toThrow(/greater than 0/i);

      const negativeCoupon = {
        ...testPercentageCoupon,
        code: 'NEGATIVE',
        discount_value: -5
      };

      await expect(createCoupon(negativeCoupon))
        .rejects.toThrow(/greater than 0/i);
    });
  });

  describe('getCoupons', () => {
    it('should return empty array when no coupons exist', async () => {
      const result = await getCoupons();
      expect(result).toHaveLength(0);
    });

    it('should return all coupons ordered by created_at desc', async () => {
      const coupon1 = await createCoupon(testPercentageCoupon);
      const coupon2 = await createCoupon({ ...testFixedCoupon, code: 'SECOND' });

      const result = await getCoupons();

      expect(result).toHaveLength(2);
      expect(result[0].created_at >= result[1].created_at).toBe(true);
      expect(result.map(c => c.code)).toContain('SAVE20');
      expect(result.map(c => c.code)).toContain('SECOND');
    });

    it('should return coupons with numeric conversions', async () => {
      await createCoupon(testPercentageCoupon);

      const result = await getCoupons();

      expect(result).toHaveLength(1);
      expect(typeof result[0].discount_value).toBe('number');
      expect(typeof result[0].minimum_order).toBe('number');
    });
  });

  describe('getActiveCoupons', () => {
    it('should return only active coupons', async () => {
      const activeCoupon = await createCoupon(testPercentageCoupon);
      
      // Create an inactive coupon
      const inactiveCoupon = await createCoupon({ ...testFixedCoupon, code: 'INACTIVE' });
      await db.update(couponsTable)
        .set({ is_active: false })
        .where(eq(couponsTable.id, inactiveCoupon.id))
        .execute();

      const result = await getActiveCoupons();

      expect(result).toHaveLength(1);
      expect(result[0].code).toEqual('SAVE20');
    });

    it('should exclude expired coupons', async () => {
      await createCoupon(testPercentageCoupon);
      await createCoupon(testExpiredCoupon);

      const result = await getActiveCoupons();

      expect(result).toHaveLength(1);
      expect(result[0].code).toEqual('SAVE20');
    });

    it('should exclude coupons that reached usage limit', async () => {
      const limitedCoupon = await createCoupon({
        ...testPercentageCoupon,
        code: 'LIMITED',
        usage_limit: 1
      });

      // Update usage count to match limit
      await db.update(couponsTable)
        .set({ used_count: 1 })
        .where(eq(couponsTable.id, limitedCoupon.id))
        .execute();

      const result = await getActiveCoupons();

      expect(result).toHaveLength(0);
    });

    it('should include coupons with null usage limits', async () => {
      await createCoupon(testFixedCoupon);

      const result = await getActiveCoupons();

      expect(result).toHaveLength(1);
      expect(result[0].usage_limit).toBeNull();
    });
  });

  describe('validateCoupon', () => {
    it('should validate a percentage coupon correctly', async () => {
      await createCoupon(testPercentageCoupon);

      const result = await validateCoupon('SAVE20', 100);

      expect(result.isValid).toBe(true);
      expect(result.coupon).toBeDefined();
      expect(result.discount).toEqual(20); // 20% of 100
      expect(result.error).toBeUndefined();
    });

    it('should validate a fixed discount coupon correctly', async () => {
      await createCoupon(testFixedCoupon);

      const result = await validateCoupon('FIXED10', 100);

      expect(result.isValid).toBe(true);
      expect(result.coupon).toBeDefined();
      expect(result.discount).toEqual(10);
    });

    it('should reject non-existent coupon', async () => {
      const result = await validateCoupon('NONEXISTENT', 100);

      expect(result.isValid).toBe(false);
      expect(result.error).toEqual('Coupon not found');
    });

    it('should reject inactive coupon', async () => {
      const coupon = await createCoupon(testPercentageCoupon);
      await db.update(couponsTable)
        .set({ is_active: false })
        .where(eq(couponsTable.id, coupon.id))
        .execute();

      const result = await validateCoupon('SAVE20', 100);

      expect(result.isValid).toBe(false);
      expect(result.error).toEqual('Coupon is not active');
    });

    it('should reject expired coupon', async () => {
      await createCoupon(testExpiredCoupon);

      const result = await validateCoupon('EXPIRED', 100);

      expect(result.isValid).toBe(false);
      expect(result.error).toEqual('Coupon has expired');
    });

    it('should reject coupon that reached usage limit', async () => {
      const coupon = await createCoupon({
        ...testPercentageCoupon,
        usage_limit: 1
      });

      await db.update(couponsTable)
        .set({ used_count: 1 })
        .where(eq(couponsTable.id, coupon.id))
        .execute();

      const result = await validateCoupon('SAVE20', 100);

      expect(result.isValid).toBe(false);
      expect(result.error).toEqual('Coupon usage limit reached');
    });

    it('should reject order below minimum order amount', async () => {
      await createCoupon(testPercentageCoupon);

      const result = await validateCoupon('SAVE20', 30); // Below $50 minimum

      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/minimum order amount/i);
    });

    it('should cap discount at order total', async () => {
      await createCoupon(testFixedCoupon);

      const result = await validateCoupon('FIXED10', 5); // Order less than discount

      expect(result.isValid).toBe(true);
      expect(result.discount).toEqual(5); // Capped at order total
    });
  });

  describe('applyCoupon', () => {
    it('should apply coupon to order and update usage count', async () => {
      // Create test user and order
      const userResult = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'hashed',
          first_name: 'Test',
          last_name: 'User',
          role: 'customer'
        })
        .returning()
        .execute();

      const orderResult = await db.insert(ordersTable)
        .values({
          user_id: userResult[0].id,
          order_number: 'ORD-001',
          subtotal: '100.00',
          tax_amount: '0.00',
          discount_amount: '0.00',
          total_amount: '100.00'
        })
        .returning()
        .execute();

      const coupon = await createCoupon(testPercentageCoupon);

      const result = await applyCoupon('SAVE20', orderResult[0].id);

      expect(result.success).toBe(true);
      expect(result.discount).toEqual(20);

      // Check coupon usage count was incremented
      const updatedCoupon = await getCouponById(coupon.id);
      expect(updatedCoupon!.used_count).toEqual(1);

      // Check order was updated
      const updatedOrders = await db.select()
        .from(ordersTable)
        .where(eq(ordersTable.id, orderResult[0].id))
        .execute();

      expect(updatedOrders[0].coupon_id).toEqual(coupon.id);
      expect(parseFloat(updatedOrders[0].discount_amount)).toEqual(20);
      expect(parseFloat(updatedOrders[0].total_amount)).toEqual(80);
    });

    it('should reject invalid coupon application', async () => {
      const result = await applyCoupon('NONEXISTENT', 999);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject application to non-existent order', async () => {
      await createCoupon(testPercentageCoupon);

      const result = await applyCoupon('SAVE20', 999);

      expect(result.success).toBe(false);
      expect(result.error).toEqual('Order not found');
    });
  });

  describe('getCouponById', () => {
    it('should return coupon by ID', async () => {
      const created = await createCoupon(testPercentageCoupon);

      const result = await getCouponById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(created.id);
      expect(result!.code).toEqual('SAVE20');
      expect(typeof result!.discount_value).toBe('number');
    });

    it('should return null for non-existent coupon', async () => {
      const result = await getCouponById(999);

      expect(result).toBeNull();
    });
  });

  describe('updateCoupon', () => {
    it('should update coupon successfully', async () => {
      const created = await createCoupon(testPercentageCoupon);

      const updateInput: UpdateCouponInput = {
        id: created.id,
        code: 'UPDATED20',
        description: 'Updated description',
        discount_value: 25,
        is_active: false
      };

      const result = await updateCoupon(updateInput);

      expect(result).not.toBeNull();
      expect(result!.code).toEqual('UPDATED20');
      expect(result!.description).toEqual('Updated description');
      expect(result!.discount_value).toEqual(25);
      expect(typeof result!.discount_value).toBe('number');
      expect(result!.is_active).toBe(false);
    });

    it('should return null for non-existent coupon', async () => {
      const updateInput: UpdateCouponInput = {
        id: 999,
        code: 'NONEXISTENT'
      };

      const result = await updateCoupon(updateInput);

      expect(result).toBeNull();
    });

    it('should reject duplicate code when updating', async () => {
      const coupon1 = await createCoupon(testPercentageCoupon);
      const coupon2 = await createCoupon({ ...testFixedCoupon, code: 'ANOTHER' });

      const updateInput: UpdateCouponInput = {
        id: coupon2.id,
        code: 'SAVE20' // Duplicate of coupon1
      };

      await expect(updateCoupon(updateInput))
        .rejects.toThrow(/already exists/i);
    });

    it('should validate discount values on update', async () => {
      const created = await createCoupon(testPercentageCoupon);

      const invalidUpdate: UpdateCouponInput = {
        id: created.id,
        discount_type: 'percentage',
        discount_value: 150
      };

      await expect(updateCoupon(invalidUpdate))
        .rejects.toThrow(/cannot exceed 100%/i);
    });
  });

  describe('deleteCoupon', () => {
    it('should hard delete unused coupon', async () => {
      const created = await createCoupon(testPercentageCoupon);

      const result = await deleteCoupon(created.id);

      expect(result).toBe(true);

      // Verify coupon was deleted
      const coupon = await getCouponById(created.id);
      expect(coupon).toBeNull();
    });

    it('should soft delete used coupon', async () => {
      // Create test user and order
      const userResult = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'hashed',
          first_name: 'Test',
          last_name: 'User',
          role: 'customer'
        })
        .returning()
        .execute();

      const created = await createCoupon(testPercentageCoupon);

      // Create order with coupon
      await db.insert(ordersTable)
        .values({
          user_id: userResult[0].id,
          order_number: 'ORD-001',
          subtotal: '100.00',
          tax_amount: '0.00',
          discount_amount: '0.00',
          total_amount: '100.00',
          coupon_id: created.id
        })
        .execute();

      const result = await deleteCoupon(created.id);

      expect(result).toBe(true);

      // Verify coupon was deactivated, not deleted
      const coupon = await getCouponById(created.id);
      expect(coupon).not.toBeNull();
      expect(coupon!.is_active).toBe(false);
    });

    it('should return false for non-existent coupon', async () => {
      const result = await deleteCoupon(999);

      expect(result).toBe(false);
    });
  });
});