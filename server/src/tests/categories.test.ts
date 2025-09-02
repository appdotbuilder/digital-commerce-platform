import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { categoriesTable, productsTable } from '../db/schema';
import { type CreateCategoryInput, type UpdateCategoryInput } from '../schema';
import { 
  createCategory, 
  getCategories, 
  getActiveCategories, 
  getCategoryById, 
  updateCategory, 
  deleteCategory 
} from '../handlers/categories';
import { eq } from 'drizzle-orm';

// Test input data
const testCategoryInput: CreateCategoryInput = {
  name: 'Software Development',
  description: 'Programming tools and utilities',
  slug: 'software-development'
};

const testCategoryInput2: CreateCategoryInput = {
  name: 'Design Resources',
  description: 'Graphics and design templates',
  slug: 'design-resources'
};

describe('Categories Handler', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createCategory', () => {
    it('should create a category successfully', async () => {
      const result = await createCategory(testCategoryInput);

      expect(result.name).toEqual('Software Development');
      expect(result.description).toEqual('Programming tools and utilities');
      expect(result.slug).toEqual('software-development');
      expect(result.is_active).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save category to database', async () => {
      const result = await createCategory(testCategoryInput);

      const categories = await db.select()
        .from(categoriesTable)
        .where(eq(categoriesTable.id, result.id))
        .execute();

      expect(categories).toHaveLength(1);
      expect(categories[0].name).toEqual('Software Development');
      expect(categories[0].description).toEqual('Programming tools and utilities');
      expect(categories[0].slug).toEqual('software-development');
      expect(categories[0].is_active).toBe(true);
    });

    it('should create category with null description', async () => {
      const inputWithNullDesc: CreateCategoryInput = {
        name: 'Test Category',
        description: null,
        slug: 'test-category'
      };

      const result = await createCategory(inputWithNullDesc);

      expect(result.name).toEqual('Test Category');
      expect(result.description).toBeNull();
      expect(result.slug).toEqual('test-category');
    });

    it('should throw error for duplicate slug', async () => {
      await createCategory(testCategoryInput);

      expect(createCategory(testCategoryInput)).rejects.toThrow(/duplicate/i);
    });
  });

  describe('getCategories', () => {
    it('should return empty array when no categories exist', async () => {
      const result = await getCategories();
      expect(result).toEqual([]);
    });

    it('should return all categories ordered by name', async () => {
      await createCategory(testCategoryInput);
      await createCategory(testCategoryInput2);

      const result = await getCategories();

      expect(result).toHaveLength(2);
      // Should be ordered alphabetically: "Design Resources" comes before "Software Development"
      expect(result[0].name).toEqual('Design Resources');
      expect(result[1].name).toEqual('Software Development');
    });

    it('should return both active and inactive categories', async () => {
      const category1 = await createCategory(testCategoryInput);
      await createCategory(testCategoryInput2);

      // Deactivate one category
      await updateCategory({
        id: category1.id,
        is_active: false
      });

      const result = await getCategories();

      expect(result).toHaveLength(2);
      expect(result.some(cat => cat.is_active === false)).toBe(true);
      expect(result.some(cat => cat.is_active === true)).toBe(true);
    });
  });

  describe('getActiveCategories', () => {
    it('should return empty array when no active categories exist', async () => {
      const result = await getActiveCategories();
      expect(result).toEqual([]);
    });

    it('should return only active categories', async () => {
      const category1 = await createCategory(testCategoryInput);
      await createCategory(testCategoryInput2);

      // Deactivate one category
      await updateCategory({
        id: category1.id,
        is_active: false
      });

      const result = await getActiveCategories();

      expect(result).toHaveLength(1);
      expect(result[0].name).toEqual('Design Resources');
      expect(result[0].is_active).toBe(true);
    });

    it('should return categories ordered by name', async () => {
      await createCategory(testCategoryInput);
      await createCategory(testCategoryInput2);

      const result = await getActiveCategories();

      expect(result).toHaveLength(2);
      expect(result[0].name).toEqual('Design Resources');
      expect(result[1].name).toEqual('Software Development');
    });
  });

  describe('getCategoryById', () => {
    it('should return null for non-existent category', async () => {
      const result = await getCategoryById(999);
      expect(result).toBeNull();
    });

    it('should return category when found', async () => {
      const created = await createCategory(testCategoryInput);
      const result = await getCategoryById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(created.id);
      expect(result!.name).toEqual('Software Development');
      expect(result!.description).toEqual('Programming tools and utilities');
      expect(result!.slug).toEqual('software-development');
    });

    it('should return inactive categories as well', async () => {
      const created = await createCategory(testCategoryInput);
      
      // Deactivate the category
      await updateCategory({
        id: created.id,
        is_active: false
      });

      const result = await getCategoryById(created.id);

      expect(result).not.toBeNull();
      expect(result!.is_active).toBe(false);
    });
  });

  describe('updateCategory', () => {
    it('should return null for non-existent category', async () => {
      const updateInput: UpdateCategoryInput = {
        id: 999,
        name: 'Updated Name'
      };

      const result = await updateCategory(updateInput);
      expect(result).toBeNull();
    });

    it('should update category name', async () => {
      const created = await createCategory(testCategoryInput);
      
      const updateInput: UpdateCategoryInput = {
        id: created.id,
        name: 'Updated Software Development'
      };

      const result = await updateCategory(updateInput);

      expect(result).not.toBeNull();
      expect(result!.name).toEqual('Updated Software Development');
      expect(result!.description).toEqual(created.description);
      expect(result!.slug).toEqual(created.slug);
      expect(result!.updated_at.getTime()).toBeGreaterThan(created.updated_at.getTime());
    });

    it('should update category description', async () => {
      const created = await createCategory(testCategoryInput);
      
      const updateInput: UpdateCategoryInput = {
        id: created.id,
        description: 'Updated description for programming tools'
      };

      const result = await updateCategory(updateInput);

      expect(result).not.toBeNull();
      expect(result!.description).toEqual('Updated description for programming tools');
      expect(result!.name).toEqual(created.name);
    });

    it('should update category slug', async () => {
      const created = await createCategory(testCategoryInput);
      
      const updateInput: UpdateCategoryInput = {
        id: created.id,
        slug: 'updated-software-dev'
      };

      const result = await updateCategory(updateInput);

      expect(result).not.toBeNull();
      expect(result!.slug).toEqual('updated-software-dev');
      expect(result!.name).toEqual(created.name);
    });

    it('should update category active status', async () => {
      const created = await createCategory(testCategoryInput);
      
      const updateInput: UpdateCategoryInput = {
        id: created.id,
        is_active: false
      };

      const result = await updateCategory(updateInput);

      expect(result).not.toBeNull();
      expect(result!.is_active).toBe(false);
      expect(result!.name).toEqual(created.name);
    });

    it('should update multiple fields at once', async () => {
      const created = await createCategory(testCategoryInput);
      
      const updateInput: UpdateCategoryInput = {
        id: created.id,
        name: 'Programming & Development',
        description: 'Comprehensive programming resources',
        slug: 'programming-development',
        is_active: false
      };

      const result = await updateCategory(updateInput);

      expect(result).not.toBeNull();
      expect(result!.name).toEqual('Programming & Development');
      expect(result!.description).toEqual('Comprehensive programming resources');
      expect(result!.slug).toEqual('programming-development');
      expect(result!.is_active).toBe(false);
    });

    it('should set description to null', async () => {
      const created = await createCategory(testCategoryInput);
      
      const updateInput: UpdateCategoryInput = {
        id: created.id,
        description: null
      };

      const result = await updateCategory(updateInput);

      expect(result).not.toBeNull();
      expect(result!.description).toBeNull();
      expect(result!.name).toEqual(created.name);
    });

    it('should throw error for duplicate slug', async () => {
      const category1 = await createCategory(testCategoryInput);
      await createCategory(testCategoryInput2);

      const updateInput: UpdateCategoryInput = {
        id: category1.id,
        slug: 'design-resources' // This slug already exists
      };

      expect(updateCategory(updateInput)).rejects.toThrow(/duplicate/i);
    });
  });

  describe('deleteCategory', () => {
    it('should return false for non-existent category', async () => {
      const result = await deleteCategory(999);
      expect(result).toBe(false);
    });

    it('should delete category successfully', async () => {
      const created = await createCategory(testCategoryInput);
      
      const result = await deleteCategory(created.id);
      expect(result).toBe(true);

      // Verify category is deleted
      const found = await getCategoryById(created.id);
      expect(found).toBeNull();
    });

    it('should throw error when category has associated products', async () => {
      const category = await createCategory(testCategoryInput);

      // Create a product in this category
      await db.insert(productsTable).values({
        name: 'Test Product',
        description: 'A test product',
        price: '19.99',
        category_id: category.id,
        stock_quantity: 10
      }).execute();

      expect(deleteCategory(category.id)).rejects.toThrow(/cannot delete category/i);

      // Verify category still exists
      const found = await getCategoryById(category.id);
      expect(found).not.toBeNull();
    });

    it('should be able to delete category after removing associated products', async () => {
      const category = await createCategory(testCategoryInput);

      // Create a product in this category
      const productResult = await db.insert(productsTable).values({
        name: 'Test Product',
        description: 'A test product',
        price: '19.99',
        category_id: category.id,
        stock_quantity: 10
      }).returning().execute();

      // First attempt should fail
      expect(deleteCategory(category.id)).rejects.toThrow(/cannot delete category/i);

      // Delete the product first
      await db.delete(productsTable)
        .where(eq(productsTable.id, productResult[0].id))
        .execute();

      // Now deletion should succeed
      const result = await deleteCategory(category.id);
      expect(result).toBe(true);

      // Verify category is deleted
      const found = await getCategoryById(category.id);
      expect(found).toBeNull();
    });
  });
});