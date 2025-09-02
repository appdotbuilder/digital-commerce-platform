import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, categoriesTable, productsTable, cartItemsTable, couponsTable } from '../db/schema';
import { type AddToCartInput, type UpdateCartItemInput } from '../schema';
import {
  addToCart,
  getCartItems,
  updateCartItem,
  removeFromCart,
  clearCart,
  calculateCartTotal,
  validateCart,
  getCartItemCount
} from '../handlers/cart';
import { eq, and } from 'drizzle-orm';

describe('Cart Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Test data setup helper
  const setupTestData = async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        password_hash: 'hashedpassword',
        first_name: 'Test',
        last_name: 'User',
        role: 'customer'
      })
      .returning()
      .execute();

    // Create test category
    const category = await db.insert(categoriesTable)
      .values({
        name: 'Software',
        slug: 'software',
        description: 'Software products'
      })
      .returning()
      .execute();

    // Create test products
    const product1 = await db.insert(productsTable)
      .values({
        name: 'Test Software',
        description: 'A test software product',
        price: '29.99',
        category_id: category[0].id,
        stock_quantity: 10
      })
      .returning()
      .execute();

    const product2 = await db.insert(productsTable)
      .values({
        name: 'Another Software',
        description: 'Another test software product',
        price: '49.99',
        category_id: category[0].id,
        stock_quantity: 5
      })
      .returning()
      .execute();

    // Create inactive product
    const inactiveProduct = await db.insert(productsTable)
      .values({
        name: 'Inactive Product',
        description: 'An inactive product',
        price: '19.99',
        category_id: category[0].id,
        stock_quantity: 3,
        is_active: false
      })
      .returning()
      .execute();

    // Create cheap product for minimum order testing
    const cheapProduct = await db.insert(productsTable)
      .values({
        name: 'Cheap Product',
        description: 'A cheap product',
        price: '15.99',
        category_id: category[0].id,
        stock_quantity: 10
      })
      .returning()
      .execute();

    // Create coupon
    const coupon = await db.insert(couponsTable)
      .values({
        code: 'TEST10',
        description: '10% off',
        discount_type: 'percentage',
        discount_value: '10.00',
        minimum_order: '20.00',
        usage_limit: 100,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      })
      .returning()
      .execute();

    return {
      user: user[0],
      category: category[0],
      product1: product1[0],
      product2: product2[0],
      inactiveProduct: inactiveProduct[0],
      cheapProduct: cheapProduct[0],
      coupon: coupon[0]
    };
  };

  describe('addToCart', () => {
    it('should add item to cart successfully', async () => {
      const { user, product1 } = await setupTestData();

      const input: AddToCartInput = {
        user_id: user.id,
        product_id: product1.id,
        quantity: 2
      };

      const result = await addToCart(input);

      expect(result.user_id).toBe(user.id);
      expect(result.product_id).toBe(product1.id);
      expect(result.quantity).toBe(2);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should update existing cart item quantity', async () => {
      const { user, product1 } = await setupTestData();

      // Add item first time
      await addToCart({
        user_id: user.id,
        product_id: product1.id,
        quantity: 2
      });

      // Add same item again
      const result = await addToCart({
        user_id: user.id,
        product_id: product1.id,
        quantity: 3
      });

      expect(result.quantity).toBe(5); // 2 + 3
    });

    it('should throw error for non-existent user', async () => {
      const { product1 } = await setupTestData();

      await expect(addToCart({
        user_id: 999,
        product_id: product1.id,
        quantity: 1
      })).rejects.toThrow(/user not found/i);
    });

    it('should throw error for inactive product', async () => {
      const { user, inactiveProduct } = await setupTestData();

      await expect(addToCart({
        user_id: user.id,
        product_id: inactiveProduct.id,
        quantity: 1
      })).rejects.toThrow(/product not found or inactive/i);
    });

    it('should throw error for insufficient stock', async () => {
      const { user, product1 } = await setupTestData();

      await expect(addToCart({
        user_id: user.id,
        product_id: product1.id,
        quantity: 15 // More than stock_quantity (10)
      })).rejects.toThrow(/insufficient stock/i);
    });

    it('should throw error when adding to existing item exceeds stock', async () => {
      const { user, product2 } = await setupTestData();

      // Add initial quantity
      await addToCart({
        user_id: user.id,
        product_id: product2.id,
        quantity: 3
      });

      // Try to add more than remaining stock
      await expect(addToCart({
        user_id: user.id,
        product_id: product2.id,
        quantity: 3 // 3 + 3 = 6, but stock is only 5
      })).rejects.toThrow(/insufficient stock for requested quantity/i);
    });
  });

  describe('getCartItems', () => {
    it('should return cart items with product details', async () => {
      const { user, product1, product2 } = await setupTestData();

      // Add items to cart
      await addToCart({ user_id: user.id, product_id: product1.id, quantity: 2 });
      await addToCart({ user_id: user.id, product_id: product2.id, quantity: 1 });

      const result = await getCartItems(user.id);

      expect(result).toHaveLength(2);
      expect(result[0].product.name).toBeDefined();
      expect(result[0].product.price).toBe(29.99);
      expect(typeof result[0].product.price).toBe('number');
      expect(result[0].quantity).toBe(2);
    });

    it('should return empty array for user with no cart items', async () => {
      const { user } = await setupTestData();

      const result = await getCartItems(user.id);

      expect(result).toHaveLength(0);
    });
  });

  describe('updateCartItem', () => {
    it('should update cart item quantity successfully', async () => {
      const { user, product1 } = await setupTestData();

      const cartItem = await addToCart({
        user_id: user.id,
        product_id: product1.id,
        quantity: 2
      });

      const input: UpdateCartItemInput = {
        id: cartItem.id,
        quantity: 5
      };

      const result = await updateCartItem(input);

      expect(result).not.toBeNull();
      expect(result!.quantity).toBe(5);
      expect(result!.updated_at).toBeInstanceOf(Date);
    });

    it('should return null for non-existent cart item', async () => {
      const result = await updateCartItem({
        id: 999,
        quantity: 1
      });

      expect(result).toBeNull();
    });

    it('should throw error for insufficient stock', async () => {
      const { user, product2 } = await setupTestData();

      const cartItem = await addToCart({
        user_id: user.id,
        product_id: product2.id,
        quantity: 2
      });

      await expect(updateCartItem({
        id: cartItem.id,
        quantity: 10 // More than stock (5)
      })).rejects.toThrow(/insufficient stock/i);
    });
  });

  describe('removeFromCart', () => {
    it('should remove cart item successfully', async () => {
      const { user, product1 } = await setupTestData();

      const cartItem = await addToCart({
        user_id: user.id,
        product_id: product1.id,
        quantity: 2
      });

      const result = await removeFromCart(cartItem.id, user.id);

      expect(result).toBe(true);

      // Verify item is removed
      const cartItems = await getCartItems(user.id);
      expect(cartItems).toHaveLength(0);
    });

    it('should return false for non-existent or unauthorized cart item', async () => {
      const { user } = await setupTestData();

      const result = await removeFromCart(999, user.id);

      expect(result).toBe(false);
    });
  });

  describe('clearCart', () => {
    it('should clear all cart items for user', async () => {
      const { user, product1, product2 } = await setupTestData();

      // Add multiple items
      await addToCart({ user_id: user.id, product_id: product1.id, quantity: 2 });
      await addToCart({ user_id: user.id, product_id: product2.id, quantity: 1 });

      const result = await clearCart(user.id);

      expect(result).toBe(true);

      // Verify cart is empty
      const cartItems = await getCartItems(user.id);
      expect(cartItems).toHaveLength(0);
    });

    it('should return true even if cart is already empty', async () => {
      const { user } = await setupTestData();

      const result = await clearCart(user.id);

      expect(result).toBe(true);
    });
  });

  describe('calculateCartTotal', () => {
    it('should calculate cart total without coupon', async () => {
      const { user, product1, product2 } = await setupTestData();

      // Add items to cart
      await addToCart({ user_id: user.id, product_id: product1.id, quantity: 2 }); // 2 * 29.99 = 59.98
      await addToCart({ user_id: user.id, product_id: product2.id, quantity: 1 }); // 1 * 49.99 = 49.99

      const result = await calculateCartTotal(user.id);

      expect(result.subtotal).toBe(109.97); // 59.98 + 49.99
      expect(result.discount_amount).toBe(0);
      expect(result.tax_amount).toBe(11.00); // 10% of subtotal, rounded
      expect(result.total).toBe(120.97); // subtotal + tax, rounded
      expect(result.items).toHaveLength(2);
    });

    it('should apply percentage coupon correctly', async () => {
      const { user, product1, product2 } = await setupTestData();

      // Add items to cart
      await addToCart({ user_id: user.id, product_id: product1.id, quantity: 2 });
      await addToCart({ user_id: user.id, product_id: product2.id, quantity: 1 });

      const result = await calculateCartTotal(user.id, 'TEST10');

      expect(result.subtotal).toBe(109.97);
      expect(result.discount_amount).toBe(11.00); // 10% of subtotal, rounded
      expect(result.tax_amount).toBe(9.90); // 10% of (subtotal - discount), rounded
      expect(result.total).toBe(108.87); // subtotal - discount + tax, rounded
    });

    it('should not apply coupon if minimum order not met', async () => {
      const { user, cheapProduct } = await setupTestData();

      // Add item below minimum order (20.00)
      await addToCart({ user_id: user.id, product_id: cheapProduct.id, quantity: 1 }); // 15.99 (below 20.00 minimum)

      const result = await calculateCartTotal(user.id, 'TEST10');

      expect(result.subtotal).toBe(15.99);
      expect(result.discount_amount).toBe(0); // No discount applied due to minimum order not met
      expect(result.tax_amount).toBe(1.60); // 10% of subtotal, rounded
      expect(result.total).toBe(17.59); // subtotal + tax, rounded
    });

    it('should handle invalid coupon code', async () => {
      const { user, product1 } = await setupTestData();

      await addToCart({ user_id: user.id, product_id: product1.id, quantity: 2 });

      const result = await calculateCartTotal(user.id, 'INVALID');

      expect(result.discount_amount).toBe(0);
    });
  });

  describe('validateCart', () => {
    it('should return valid for available products', async () => {
      const { user, product1, product2 } = await setupTestData();

      await addToCart({ user_id: user.id, product_id: product1.id, quantity: 2 });
      await addToCart({ user_id: user.id, product_id: product2.id, quantity: 1 });

      const result = await validateCart(user.id);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.unavailableItems).toHaveLength(0);
    });

    it('should detect insufficient stock', async () => {
      const { user, product2 } = await setupTestData();

      await addToCart({ user_id: user.id, product_id: product2.id, quantity: 3 });
      
      // Manually update stock to be less than cart quantity
      await db.update(productsTable)
        .set({ stock_quantity: 2 })
        .where(eq(productsTable.id, product2.id))
        .execute();

      const result = await validateCart(user.id);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/insufficient stock/i);
      expect(result.unavailableItems).toContain(product2.id);
    });

    it('should detect inactive products', async () => {
      const { user, product1 } = await setupTestData();

      await addToCart({ user_id: user.id, product_id: product1.id, quantity: 1 });
      
      // Deactivate product
      await db.update(productsTable)
        .set({ is_active: false })
        .where(eq(productsTable.id, product1.id))
        .execute();

      const result = await validateCart(user.id);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toMatch(/no longer available/i);
      expect(result.unavailableItems).toContain(product1.id);
    });
  });

  describe('getCartItemCount', () => {
    it('should return total item count', async () => {
      const { user, product1, product2 } = await setupTestData();

      await addToCart({ user_id: user.id, product_id: product1.id, quantity: 3 });
      await addToCart({ user_id: user.id, product_id: product2.id, quantity: 2 });

      const result = await getCartItemCount(user.id);

      expect(result).toBe(5); // 3 + 2
    });

    it('should return 0 for empty cart', async () => {
      const { user } = await setupTestData();

      const result = await getCartItemCount(user.id);

      expect(result).toBe(0);
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully in addToCart', async () => {
      // Test with invalid user_id (should cause foreign key constraint error)
      await expect(addToCart({
        user_id: -1,
        product_id: -1,
        quantity: 1
      })).rejects.toThrow();
    });

    it('should handle database errors gracefully in getCartItems', async () => {
      // This should not throw but return empty array
      const result = await getCartItems(999);
      expect(result).toHaveLength(0);
    });
  });
});