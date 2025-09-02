import { db } from '../db';
import { cartItemsTable, productsTable, categoriesTable, usersTable, couponsTable } from '../db/schema';
import { type AddToCartInput, type UpdateCartItemInput, type CartItem } from '../schema';
import { eq, and, sum, gte, lte } from 'drizzle-orm';

/**
 * Handler for adding items to shopping cart
 * This handler adds a product to user's cart or updates quantity if exists
 */
export async function addToCart(input: AddToCartInput): Promise<CartItem> {
  try {
    // 1. Check if user exists
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .execute();

    if (user.length === 0) {
      throw new Error('User not found');
    }

    // 2. Check if product exists and is active
    const product = await db.select()
      .from(productsTable)
      .where(and(
        eq(productsTable.id, input.product_id),
        eq(productsTable.is_active, true)
      ))
      .execute();

    if (product.length === 0) {
      throw new Error('Product not found or inactive');
    }

    // 3. Validate stock availability
    if (product[0].stock_quantity < input.quantity) {
      throw new Error('Insufficient stock');
    }

    // 4. Check if item already exists in cart
    const existingItem = await db.select()
      .from(cartItemsTable)
      .where(and(
        eq(cartItemsTable.user_id, input.user_id),
        eq(cartItemsTable.product_id, input.product_id)
      ))
      .execute();

    if (existingItem.length > 0) {
      // Update existing cart item
      const newQuantity = existingItem[0].quantity + input.quantity;
      
      // Check total quantity against stock
      if (newQuantity > product[0].stock_quantity) {
        throw new Error('Insufficient stock for requested quantity');
      }

      const result = await db.update(cartItemsTable)
        .set({
          quantity: newQuantity,
          updated_at: new Date()
        })
        .where(eq(cartItemsTable.id, existingItem[0].id))
        .returning()
        .execute();

      return result[0];
    } else {
      // Create new cart item
      const result = await db.insert(cartItemsTable)
        .values({
          user_id: input.user_id,
          product_id: input.product_id,
          quantity: input.quantity
        })
        .returning()
        .execute();

      return result[0];
    }
  } catch (error) {
    console.error('Add to cart failed:', error);
    throw error;
  }
}

/**
 * Handler for getting user's cart items
 * This handler retrieves all items in a user's cart with product details
 */
export async function getCartItems(userId: number): Promise<(CartItem & { product: any })[]> {
  try {
    const results = await db.select({
      id: cartItemsTable.id,
      user_id: cartItemsTable.user_id,
      product_id: cartItemsTable.product_id,
      quantity: cartItemsTable.quantity,
      created_at: cartItemsTable.created_at,
      updated_at: cartItemsTable.updated_at,
      product: {
        id: productsTable.id,
        name: productsTable.name,
        description: productsTable.description,
        short_description: productsTable.short_description,
        price: productsTable.price,
        image_url: productsTable.image_url,
        stock_quantity: productsTable.stock_quantity,
        is_active: productsTable.is_active,
        category_name: categoriesTable.name
      }
    })
    .from(cartItemsTable)
    .innerJoin(productsTable, eq(cartItemsTable.product_id, productsTable.id))
    .innerJoin(categoriesTable, eq(productsTable.category_id, categoriesTable.id))
    .where(eq(cartItemsTable.user_id, userId))
    .execute();

    return results.map(result => ({
      id: result.id,
      user_id: result.user_id,
      product_id: result.product_id,
      quantity: result.quantity,
      created_at: result.created_at,
      updated_at: result.updated_at,
      product: {
        ...result.product,
        price: parseFloat(result.product.price)
      }
    }));
  } catch (error) {
    console.error('Get cart items failed:', error);
    throw error;
  }
}

/**
 * Handler for updating cart item quantity
 * This handler updates the quantity of a specific cart item
 */
export async function updateCartItem(input: UpdateCartItemInput): Promise<CartItem | null> {
  try {
    // 1. Get cart item and verify it exists
    const cartItem = await db.select()
      .from(cartItemsTable)
      .where(eq(cartItemsTable.id, input.id))
      .execute();

    if (cartItem.length === 0) {
      return null;
    }

    // 2. Check product stock availability
    const product = await db.select()
      .from(productsTable)
      .where(eq(productsTable.id, cartItem[0].product_id))
      .execute();

    if (product.length === 0 || !product[0].is_active) {
      throw new Error('Product not available');
    }

    if (product[0].stock_quantity < input.quantity) {
      throw new Error('Insufficient stock');
    }

    // 3. Update cart item
    const result = await db.update(cartItemsTable)
      .set({
        quantity: input.quantity,
        updated_at: new Date()
      })
      .where(eq(cartItemsTable.id, input.id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Update cart item failed:', error);
    throw error;
  }
}

/**
 * Handler for removing item from cart
 * This handler removes a specific item from user's cart
 */
export async function removeFromCart(cartItemId: number, userId: number): Promise<boolean> {
  try {
    const result = await db.delete(cartItemsTable)
      .where(and(
        eq(cartItemsTable.id, cartItemId),
        eq(cartItemsTable.user_id, userId)
      ))
      .returning()
      .execute();

    return result.length > 0;
  } catch (error) {
    console.error('Remove from cart failed:', error);
    throw error;
  }
}

/**
 * Handler for clearing entire cart
 * This handler removes all items from user's cart
 */
export async function clearCart(userId: number): Promise<boolean> {
  try {
    await db.delete(cartItemsTable)
      .where(eq(cartItemsTable.user_id, userId))
      .execute();

    return true;
  } catch (error) {
    console.error('Clear cart failed:', error);
    throw error;
  }
}

/**
 * Handler for calculating cart total
 * This handler calculates the total price of items in cart
 */
export async function calculateCartTotal(userId: number, couponCode?: string): Promise<{
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  items: (CartItem & { product: any })[];
}> {
  try {
    // Get cart items with product details
    const items = await getCartItems(userId);
    
    // Calculate subtotal
    const subtotal = items.reduce((total, item) => {
      return total + (item.product.price * item.quantity);
    }, 0);

    let discount_amount = 0;

    // Apply coupon if provided
    if (couponCode) {
      const coupon = await db.select()
        .from(couponsTable)
        .where(and(
          eq(couponsTable.code, couponCode),
          eq(couponsTable.is_active, true)
        ))
        .execute();

      if (coupon.length > 0) {
        const couponData = coupon[0];
        
        // Check if coupon is not expired
        const isExpired = couponData.expires_at && new Date() > couponData.expires_at;
        if (!isExpired) {
          // Check minimum order requirement
          const minimumOrder = couponData.minimum_order ? parseFloat(couponData.minimum_order) : 0;
          if (subtotal >= minimumOrder) {
            // Check usage limit
            if (!couponData.usage_limit || couponData.used_count < couponData.usage_limit) {
              const discountValue = parseFloat(couponData.discount_value);
              
              if (couponData.discount_type === 'percentage') {
                discount_amount = (subtotal * discountValue) / 100;
              } else {
                discount_amount = discountValue;
              }
              
              // Ensure discount doesn't exceed subtotal
              discount_amount = Math.min(discount_amount, subtotal);
            }
          }
        }
      }
    }

    // Calculate tax (10% for simplicity)
    const tax_rate = 0.1;
    const tax_amount = Math.round((subtotal - discount_amount) * tax_rate * 100) / 100;
    
    const total = Math.round((subtotal - discount_amount + tax_amount) * 100) / 100;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax_amount,
      discount_amount: Math.round(discount_amount * 100) / 100,
      total,
      items
    };
  } catch (error) {
    console.error('Calculate cart total failed:', error);
    throw error;
  }
}

/**
 * Handler for validating cart before checkout
 * This handler validates all cart items are available and in stock
 */
export async function validateCart(userId: number): Promise<{
  isValid: boolean;
  errors: string[];
  unavailableItems: number[];
}> {
  try {
    const items = await getCartItems(userId);
    const errors: string[] = [];
    const unavailableItems: number[] = [];

    for (const item of items) {
      // Check if product is still active
      if (!item.product.is_active) {
        errors.push(`Product "${item.product.name}" is no longer available`);
        unavailableItems.push(item.product_id);
        continue;
      }

      // Check stock quantity
      if (item.product.stock_quantity < item.quantity) {
        errors.push(`Insufficient stock for "${item.product.name}". Available: ${item.product.stock_quantity}, Requested: ${item.quantity}`);
        unavailableItems.push(item.product_id);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      unavailableItems
    };
  } catch (error) {
    console.error('Validate cart failed:', error);
    throw error;
  }
}

/**
 * Handler for getting cart item count
 * This handler returns the total number of items in user's cart
 */
export async function getCartItemCount(userId: number): Promise<number> {
  try {
    const result = await db.select({
      total: sum(cartItemsTable.quantity)
    })
    .from(cartItemsTable)
    .where(eq(cartItemsTable.user_id, userId))
    .execute();

    return parseInt(result[0]?.total || '0');
  } catch (error) {
    console.error('Get cart item count failed:', error);
    throw error;
  }
}