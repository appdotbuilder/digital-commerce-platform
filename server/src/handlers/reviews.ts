import { db } from '../db';
import { reviewsTable, productsTable, usersTable, ordersTable, orderItemsTable } from '../db/schema';
import { type CreateReviewInput, type ModerateReviewInput, type Review } from '../schema';
import { eq, and, desc, asc, avg, count, sql } from 'drizzle-orm';

/**
 * Handler for creating a new product review
 * This handler creates a new review for a product by a user
 */
export async function createReview(input: CreateReviewInput): Promise<Review> {
  try {
    // Verify product exists first
    const productExists = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, input.product_id))
      .limit(1)
      .execute();

    if (productExists.length === 0) {
      throw new Error('Product not found');
    }

    // Verify user exists
    const userExists = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .limit(1)
      .execute();

    if (userExists.length === 0) {
      throw new Error('User not found');
    }

    // Check if user has purchased the product
    const purchaseCheck = await db
      .select()
      .from(ordersTable)
      .innerJoin(orderItemsTable, eq(ordersTable.id, orderItemsTable.order_id))
      .where(and(
        eq(ordersTable.user_id, input.user_id),
        eq(orderItemsTable.product_id, input.product_id),
        eq(ordersTable.status, 'completed')
      ))
      .limit(1)
      .execute();

    if (purchaseCheck.length === 0) {
      throw new Error('User must purchase the product before reviewing');
    }

    // Check if user hasn't already reviewed this product
    const existingReview = await db
      .select()
      .from(reviewsTable)
      .where(and(
        eq(reviewsTable.user_id, input.user_id),
        eq(reviewsTable.product_id, input.product_id)
      ))
      .limit(1)
      .execute();

    if (existingReview.length > 0) {
      throw new Error('User has already reviewed this product');
    }

    // Insert review into database
    const result = await db.insert(reviewsTable)
      .values({
        product_id: input.product_id,
        user_id: input.user_id,
        rating: input.rating,
        comment: input.comment,
        is_approved: false // Reviews need approval by default
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Review creation failed:', error);
    throw error;
  }
}

/**
 * Handler for getting reviews for a product
 * This handler retrieves all approved reviews for a specific product
 */
export async function getProductReviews(productId: number): Promise<(Review & { user: { first_name: string; last_name: string } })[]> {
  try {
    const results = await db
      .select({
        id: reviewsTable.id,
        product_id: reviewsTable.product_id,
        user_id: reviewsTable.user_id,
        rating: reviewsTable.rating,
        comment: reviewsTable.comment,
        is_approved: reviewsTable.is_approved,
        created_at: reviewsTable.created_at,
        updated_at: reviewsTable.updated_at,
        user: {
          first_name: usersTable.first_name,
          last_name: usersTable.last_name
        }
      })
      .from(reviewsTable)
      .innerJoin(usersTable, eq(reviewsTable.user_id, usersTable.id))
      .where(and(
        eq(reviewsTable.product_id, productId),
        eq(reviewsTable.is_approved, true)
      ))
      .orderBy(desc(reviewsTable.created_at))
      .execute();

    return results;
  } catch (error) {
    console.error('Getting product reviews failed:', error);
    throw error;
  }
}

/**
 * Handler for getting all reviews for admin moderation
 * This handler retrieves all reviews including pending ones for admin review
 */
export async function getAllReviews(): Promise<(Review & { product: { name: string }; user: { first_name: string; last_name: string } })[]> {
  try {
    const results = await db
      .select({
        id: reviewsTable.id,
        product_id: reviewsTable.product_id,
        user_id: reviewsTable.user_id,
        rating: reviewsTable.rating,
        comment: reviewsTable.comment,
        is_approved: reviewsTable.is_approved,
        created_at: reviewsTable.created_at,
        updated_at: reviewsTable.updated_at,
        product: {
          name: productsTable.name
        },
        user: {
          first_name: usersTable.first_name,
          last_name: usersTable.last_name
        }
      })
      .from(reviewsTable)
      .innerJoin(productsTable, eq(reviewsTable.product_id, productsTable.id))
      .innerJoin(usersTable, eq(reviewsTable.user_id, usersTable.id))
      .orderBy(desc(reviewsTable.created_at))
      .execute();

    return results;
  } catch (error) {
    console.error('Getting all reviews failed:', error);
    throw error;
  }
}

/**
 * Handler for getting pending reviews for moderation
 * This handler retrieves reviews waiting for approval
 */
export async function getPendingReviews(): Promise<(Review & { product: { name: string }; user: { first_name: string; last_name: string } })[]> {
  try {
    const results = await db
      .select({
        id: reviewsTable.id,
        product_id: reviewsTable.product_id,
        user_id: reviewsTable.user_id,
        rating: reviewsTable.rating,
        comment: reviewsTable.comment,
        is_approved: reviewsTable.is_approved,
        created_at: reviewsTable.created_at,
        updated_at: reviewsTable.updated_at,
        product: {
          name: productsTable.name
        },
        user: {
          first_name: usersTable.first_name,
          last_name: usersTable.last_name
        }
      })
      .from(reviewsTable)
      .innerJoin(productsTable, eq(reviewsTable.product_id, productsTable.id))
      .innerJoin(usersTable, eq(reviewsTable.user_id, usersTable.id))
      .where(eq(reviewsTable.is_approved, false))
      .orderBy(asc(reviewsTable.created_at))
      .execute();

    return results;
  } catch (error) {
    console.error('Getting pending reviews failed:', error);
    throw error;
  }
}

/**
 * Handler for moderating a review (approve/reject)
 * This handler updates the approval status of a review
 */
export async function moderateReview(input: ModerateReviewInput): Promise<Review | null> {
  try {
    const result = await db.update(reviewsTable)
      .set({
        is_approved: input.is_approved,
        updated_at: new Date()
      })
      .where(eq(reviewsTable.id, input.id))
      .returning()
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Review moderation failed:', error);
    throw error;
  }
}

/**
 * Handler for getting review statistics for a product
 * This handler calculates average rating and review counts
 */
export async function getProductReviewStats(productId: number): Promise<{
  average_rating: number;
  total_reviews: number;
  rating_distribution: { [key: number]: number };
}> {
  try {
    // Get average rating and total count
    const statsResult = await db
      .select({
        average_rating: avg(reviewsTable.rating),
        total_reviews: count(reviewsTable.id)
      })
      .from(reviewsTable)
      .where(and(
        eq(reviewsTable.product_id, productId),
        eq(reviewsTable.is_approved, true)
      ))
      .execute();

    const stats = statsResult[0];
    const averageRating = stats.average_rating ? parseFloat(stats.average_rating.toString()) : 0;
    const totalReviews = stats.total_reviews;

    // Get rating distribution
    const distributionResult = await db
      .select({
        rating: reviewsTable.rating,
        count: count(reviewsTable.id)
      })
      .from(reviewsTable)
      .where(and(
        eq(reviewsTable.product_id, productId),
        eq(reviewsTable.is_approved, true)
      ))
      .groupBy(reviewsTable.rating)
      .execute();

    const ratingDistribution: { [key: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    distributionResult.forEach(item => {
      ratingDistribution[item.rating] = item.count;
    });

    return {
      average_rating: averageRating,
      total_reviews: totalReviews,
      rating_distribution: ratingDistribution
    };
  } catch (error) {
    console.error('Getting product review stats failed:', error);
    throw error;
  }
}

/**
 * Handler for getting user's reviews
 * This handler retrieves all reviews written by a specific user
 */
export async function getUserReviews(userId: number): Promise<(Review & { product: { name: string } })[]> {
  try {
    const results = await db
      .select({
        id: reviewsTable.id,
        product_id: reviewsTable.product_id,
        user_id: reviewsTable.user_id,
        rating: reviewsTable.rating,
        comment: reviewsTable.comment,
        is_approved: reviewsTable.is_approved,
        created_at: reviewsTable.created_at,
        updated_at: reviewsTable.updated_at,
        product: {
          name: productsTable.name
        }
      })
      .from(reviewsTable)
      .innerJoin(productsTable, eq(reviewsTable.product_id, productsTable.id))
      .where(eq(reviewsTable.user_id, userId))
      .orderBy(desc(reviewsTable.created_at))
      .execute();

    return results;
  } catch (error) {
    console.error('Getting user reviews failed:', error);
    throw error;
  }
}

/**
 * Handler for deleting a review
 * This handler removes a review from the database
 */
export async function deleteReview(id: number): Promise<boolean> {
  try {
    const result = await db.delete(reviewsTable)
      .where(eq(reviewsTable.id, id))
      .returning()
      .execute();

    return result.length > 0;
  } catch (error) {
    console.error('Review deletion failed:', error);
    throw error;
  }
}

/**
 * Handler for checking if user can review a product
 * This handler checks if user is eligible to review a specific product
 */
export async function canUserReviewProduct(userId: number, productId: number): Promise<{
  canReview: boolean;
  reason?: string;
}> {
  try {
    // Check if user has purchased the product
    const purchaseCheck = await db
      .select()
      .from(ordersTable)
      .innerJoin(orderItemsTable, eq(ordersTable.id, orderItemsTable.order_id))
      .where(and(
        eq(ordersTable.user_id, userId),
        eq(orderItemsTable.product_id, productId),
        eq(ordersTable.status, 'completed')
      ))
      .limit(1)
      .execute();

    if (purchaseCheck.length === 0) {
      return {
        canReview: false,
        reason: 'User has not purchased this product'
      };
    }

    // Check if user hasn't already reviewed this product
    const existingReview = await db
      .select()
      .from(reviewsTable)
      .where(and(
        eq(reviewsTable.user_id, userId),
        eq(reviewsTable.product_id, productId)
      ))
      .limit(1)
      .execute();

    if (existingReview.length > 0) {
      return {
        canReview: false,
        reason: 'User has already reviewed this product'
      };
    }

    return { canReview: true };
  } catch (error) {
    console.error('Checking review eligibility failed:', error);
    throw error;
  }
}