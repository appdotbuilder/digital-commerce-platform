import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  reviewsTable, 
  usersTable, 
  categoriesTable, 
  productsTable, 
  ordersTable, 
  orderItemsTable 
} from '../db/schema';
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
} from '../handlers/reviews';
import { type CreateReviewInput, type ModerateReviewInput } from '../schema';
import { eq } from 'drizzle-orm';

describe('Reviews Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create test user
  const createTestUser = async (index?: number) => {
    const suffix = index ? `${index}` : '';
    const result = await db.insert(usersTable)
      .values({
        email: `test${suffix}@example.com`,
        password_hash: 'hashed_password',
        first_name: 'Test',
        last_name: `User${suffix}`,
        role: 'customer'
      })
      .returning()
      .execute();
    return result[0];
  };

  // Helper function to create test category
  const createTestCategory = async () => {
    const result = await db.insert(categoriesTable)
      .values({
        name: 'Test Category',
        description: 'A test category',
        slug: 'test-category'
      })
      .returning()
      .execute();
    return result[0];
  };

  // Helper function to create test product
  const createTestProduct = async (categoryId: number) => {
    const result = await db.insert(productsTable)
      .values({
        name: 'Test Product',
        description: 'A test product',
        price: '19.99',
        category_id: categoryId,
        stock_quantity: 10
      })
      .returning()
      .execute();
    return result[0];
  };

  // Helper function to create completed order with product
  const createCompletedOrder = async (userId: number, productId: number) => {
    const order = await db.insert(ordersTable)
      .values({
        user_id: userId,
        order_number: 'ORD-001',
        status: 'completed',
        subtotal: '19.99',
        total_amount: '19.99'
      })
      .returning()
      .execute();

    await db.insert(orderItemsTable)
      .values({
        order_id: order[0].id,
        product_id: productId,
        quantity: 1,
        unit_price: '19.99',
        total_price: '19.99'
      })
      .execute();

    return order[0];
  };

  describe('createReview', () => {
    it('should create a review for purchased product', async () => {
      const user = await createTestUser();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      await createCompletedOrder(user.id, product.id);

      const input: CreateReviewInput = {
        product_id: product.id,
        user_id: user.id,
        rating: 5,
        comment: 'Great product!'
      };

      const result = await createReview(input);

      expect(result.product_id).toEqual(product.id);
      expect(result.user_id).toEqual(user.id);
      expect(result.rating).toEqual(5);
      expect(result.comment).toEqual('Great product!');
      expect(result.is_approved).toEqual(false);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should save review to database', async () => {
      const user = await createTestUser();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      await createCompletedOrder(user.id, product.id);

      const input: CreateReviewInput = {
        product_id: product.id,
        user_id: user.id,
        rating: 4,
        comment: 'Good product'
      };

      const result = await createReview(input);

      const reviews = await db.select()
        .from(reviewsTable)
        .where(eq(reviewsTable.id, result.id))
        .execute();

      expect(reviews).toHaveLength(1);
      expect(reviews[0].rating).toEqual(4);
      expect(reviews[0].comment).toEqual('Good product');
    });

    it('should throw error if user has not purchased product', async () => {
      const user = await createTestUser();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      const input: CreateReviewInput = {
        product_id: product.id,
        user_id: user.id,
        rating: 5,
        comment: 'Great product!'
      };

      expect(createReview(input)).rejects.toThrow(/must purchase the product before reviewing/i);
    });

    it('should throw error if user already reviewed product', async () => {
      const user = await createTestUser();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      await createCompletedOrder(user.id, product.id);

      // Create first review
      await db.insert(reviewsTable)
        .values({
          product_id: product.id,
          user_id: user.id,
          rating: 5,
          comment: 'First review'
        })
        .execute();

      const input: CreateReviewInput = {
        product_id: product.id,
        user_id: user.id,
        rating: 4,
        comment: 'Second review'
      };

      expect(createReview(input)).rejects.toThrow(/already reviewed this product/i);
    });

    it('should throw error if product does not exist', async () => {
      const user = await createTestUser();

      const input: CreateReviewInput = {
        product_id: 99999,
        user_id: user.id,
        rating: 5,
        comment: 'Great product!'
      };

      expect(createReview(input)).rejects.toThrow(/product not found/i);
    });

    it('should throw error if user does not exist', async () => {
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      const input: CreateReviewInput = {
        product_id: product.id,
        user_id: 99999,
        rating: 5,
        comment: 'Great product!'
      };

      expect(createReview(input)).rejects.toThrow(/user not found/i);
    });
  });

  describe('getProductReviews', () => {
    it('should return approved reviews for product with user info', async () => {
      const user1 = await createTestUser(1);
      const user2 = await createTestUser(2);
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      // Create approved review
      await db.insert(reviewsTable)
        .values({
          product_id: product.id,
          user_id: user1.id,
          rating: 5,
          comment: 'Great product!',
          is_approved: true
        })
        .execute();

      // Create unapproved review with different user
      await db.insert(reviewsTable)
        .values({
          product_id: product.id,
          user_id: user2.id,
          rating: 3,
          comment: 'Not approved',
          is_approved: false
        })
        .execute();

      const result = await getProductReviews(product.id);

      expect(result).toHaveLength(1);
      expect(result[0].rating).toEqual(5);
      expect(result[0].comment).toEqual('Great product!');
      expect(result[0].is_approved).toEqual(true);
      expect(result[0].user.first_name).toEqual('Test');
      expect(result[0].user.last_name).toEqual('User1');
    });

    it('should return empty array if no approved reviews exist', async () => {
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      const result = await getProductReviews(product.id);

      expect(result).toHaveLength(0);
    });
  });

  describe('getAllReviews', () => {
    it('should return all reviews with product and user info', async () => {
      const user1 = await createTestUser(1);
      const user2 = await createTestUser(2);
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      // Create approved review
      await db.insert(reviewsTable)
        .values({
          product_id: product.id,
          user_id: user1.id,
          rating: 5,
          comment: 'Approved review',
          is_approved: true
        })
        .execute();

      // Create pending review with different user
      await db.insert(reviewsTable)
        .values({
          product_id: product.id,
          user_id: user2.id,
          rating: 3,
          comment: 'Pending review',
          is_approved: false
        })
        .execute();

      const result = await getAllReviews();

      expect(result).toHaveLength(2);
      expect(result[0].product.name).toEqual('Test Product');
      expect(result[0].user.first_name).toEqual('Test');
      expect(result[0].user.last_name).toMatch(/User\d/);
    });
  });

  describe('getPendingReviews', () => {
    it('should return only unapproved reviews', async () => {
      const user1 = await createTestUser(1);
      const user2 = await createTestUser(2);
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      // Create approved review
      await db.insert(reviewsTable)
        .values({
          product_id: product.id,
          user_id: user1.id,
          rating: 5,
          comment: 'Approved review',
          is_approved: true
        })
        .execute();

      // Create pending review with different user
      await db.insert(reviewsTable)
        .values({
          product_id: product.id,
          user_id: user2.id,
          rating: 3,
          comment: 'Pending review',
          is_approved: false
        })
        .execute();

      const result = await getPendingReviews();

      expect(result).toHaveLength(1);
      expect(result[0].comment).toEqual('Pending review');
      expect(result[0].is_approved).toEqual(false);
    });
  });

  describe('moderateReview', () => {
    it('should update review approval status', async () => {
      const user = await createTestUser();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      const review = await db.insert(reviewsTable)
        .values({
          product_id: product.id,
          user_id: user.id,
          rating: 5,
          comment: 'Pending review',
          is_approved: false
        })
        .returning()
        .execute();

      const input: ModerateReviewInput = {
        id: review[0].id,
        is_approved: true
      };

      const result = await moderateReview(input);

      expect(result).toBeDefined();
      expect(result!.is_approved).toEqual(true);
      expect(result!.updated_at).toBeInstanceOf(Date);
    });

    it('should return null if review does not exist', async () => {
      const input: ModerateReviewInput = {
        id: 99999,
        is_approved: true
      };

      const result = await moderateReview(input);

      expect(result).toBeNull();
    });
  });

  describe('getProductReviewStats', () => {
    it('should calculate correct review statistics', async () => {
      const user1 = await createTestUser(1);
      const user2 = await createTestUser(2);
      const user3 = await createTestUser(3);
      const user4 = await createTestUser(4);
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      // Create multiple approved reviews with different users
      await db.insert(reviewsTable)
        .values([
          {
            product_id: product.id,
            user_id: user1.id,
            rating: 5,
            comment: 'Excellent',
            is_approved: true
          },
          {
            product_id: product.id,
            user_id: user2.id,
            rating: 4,
            comment: 'Good',
            is_approved: true
          },
          {
            product_id: product.id,
            user_id: user3.id,
            rating: 5,
            comment: 'Great',
            is_approved: true
          },
          {
            product_id: product.id,
            user_id: user4.id,
            rating: 3,
            comment: 'Not approved',
            is_approved: false
          }
        ])
        .execute();

      const result = await getProductReviewStats(product.id);

      expect(result.total_reviews).toEqual(3); // Only approved reviews
      expect(result.average_rating).toBeCloseTo(4.67, 2); // (5+4+5)/3
      expect(result.rating_distribution[3]).toEqual(0); // Unapproved review not counted
      expect(result.rating_distribution[4]).toEqual(1);
      expect(result.rating_distribution[5]).toEqual(2);
    });

    it('should return zero stats for product with no reviews', async () => {
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      const result = await getProductReviewStats(product.id);

      expect(result.total_reviews).toEqual(0);
      expect(result.average_rating).toEqual(0);
      expect(result.rating_distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    });
  });

  describe('getUserReviews', () => {
    it('should return all reviews by user with product info', async () => {
      const user = await createTestUser();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      await db.insert(reviewsTable)
        .values({
          product_id: product.id,
          user_id: user.id,
          rating: 5,
          comment: 'Great product!',
          is_approved: true
        })
        .execute();

      const result = await getUserReviews(user.id);

      expect(result).toHaveLength(1);
      expect(result[0].rating).toEqual(5);
      expect(result[0].product.name).toEqual('Test Product');
    });

    it('should return empty array if user has no reviews', async () => {
      const user = await createTestUser();

      const result = await getUserReviews(user.id);

      expect(result).toHaveLength(0);
    });
  });

  describe('deleteReview', () => {
    it('should delete existing review', async () => {
      const user = await createTestUser();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      const review = await db.insert(reviewsTable)
        .values({
          product_id: product.id,
          user_id: user.id,
          rating: 5,
          comment: 'To be deleted',
          is_approved: true
        })
        .returning()
        .execute();

      const result = await deleteReview(review[0].id);

      expect(result).toEqual(true);

      // Verify deletion
      const deletedReview = await db.select()
        .from(reviewsTable)
        .where(eq(reviewsTable.id, review[0].id))
        .execute();

      expect(deletedReview).toHaveLength(0);
    });

    it('should return false if review does not exist', async () => {
      const result = await deleteReview(99999);

      expect(result).toEqual(false);
    });
  });

  describe('canUserReviewProduct', () => {
    it('should return true if user can review', async () => {
      const user = await createTestUser();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      await createCompletedOrder(user.id, product.id);

      const result = await canUserReviewProduct(user.id, product.id);

      expect(result.canReview).toEqual(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return false if user has not purchased product', async () => {
      const user = await createTestUser();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      const result = await canUserReviewProduct(user.id, product.id);

      expect(result.canReview).toEqual(false);
      expect(result.reason).toEqual('User has not purchased this product');
    });

    it('should return false if user already reviewed product', async () => {
      const user = await createTestUser();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      await createCompletedOrder(user.id, product.id);

      // Create existing review
      await db.insert(reviewsTable)
        .values({
          product_id: product.id,
          user_id: user.id,
          rating: 5,
          comment: 'Already reviewed',
          is_approved: true
        })
        .execute();

      const result = await canUserReviewProduct(user.id, product.id);

      expect(result.canReview).toEqual(false);
      expect(result.reason).toEqual('User has already reviewed this product');
    });

    it('should return false if order is not completed', async () => {
      const user = await createTestUser();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      // Create pending order
      const order = await db.insert(ordersTable)
        .values({
          user_id: user.id,
          order_number: 'ORD-002',
          status: 'pending',
          subtotal: '19.99',
          total_amount: '19.99'
        })
        .returning()
        .execute();

      await db.insert(orderItemsTable)
        .values({
          order_id: order[0].id,
          product_id: product.id,
          quantity: 1,
          unit_price: '19.99',
          total_price: '19.99'
        })
        .execute();

      const result = await canUserReviewProduct(user.id, product.id);

      expect(result.canReview).toEqual(false);
      expect(result.reason).toEqual('User has not purchased this product');
    });
  });
});