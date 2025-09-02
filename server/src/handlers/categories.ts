import { db } from '../db';
import { categoriesTable, productsTable } from '../db/schema';
import { type CreateCategoryInput, type UpdateCategoryInput, type Category } from '../schema';
import { eq, asc, and } from 'drizzle-orm';

/**
 * Handler for creating a new product category
 * This handler creates a new category in the database
 */
export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  try {
    const result = await db.insert(categoriesTable)
      .values({
        name: input.name,
        description: input.description,
        slug: input.slug
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Category creation failed:', error);
    throw error;
  }
}

/**
 * Handler for getting all categories
 * This handler retrieves all categories from the database
 */
export async function getCategories(): Promise<Category[]> {
  try {
    const results = await db.select()
      .from(categoriesTable)
      .orderBy(asc(categoriesTable.name))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to get categories:', error);
    throw error;
  }
}

/**
 * Handler for getting active categories only
 * This handler retrieves only active categories for public display
 */
export async function getActiveCategories(): Promise<Category[]> {
  try {
    const results = await db.select()
      .from(categoriesTable)
      .where(eq(categoriesTable.is_active, true))
      .orderBy(asc(categoriesTable.name))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to get active categories:', error);
    throw error;
  }
}

/**
 * Handler for getting a single category by ID
 * This handler retrieves a specific category by its ID
 */
export async function getCategoryById(id: number): Promise<Category | null> {
  try {
    const results = await db.select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, id))
      .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Failed to get category by ID:', error);
    throw error;
  }
}

/**
 * Handler for updating a category
 * This handler updates an existing category with new data
 */
export async function updateCategory(input: UpdateCategoryInput): Promise<Category | null> {
  try {
    // Build update data dynamically based on provided fields
    const updateData: Partial<typeof categoriesTable.$inferInsert> = {};
    
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.slug !== undefined) updateData.slug = input.slug;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;
    
    // Always update the timestamp
    updateData.updated_at = new Date();

    const results = await db.update(categoriesTable)
      .set(updateData)
      .where(eq(categoriesTable.id, input.id))
      .returning()
      .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Category update failed:', error);
    throw error;
  }
}

/**
 * Handler for deleting a category
 * This handler deletes a category from the database
 */
export async function deleteCategory(id: number): Promise<boolean> {
  try {
    // Check if category has associated products
    const products = await db.select()
      .from(productsTable)
      .where(eq(productsTable.category_id, id))
      .execute();

    if (products.length > 0) {
      throw new Error('Cannot delete category with associated products');
    }

    const results = await db.delete(categoriesTable)
      .where(eq(categoriesTable.id, id))
      .returning()
      .execute();

    return results.length > 0;
  } catch (error) {
    console.error('Category deletion failed:', error);
    throw error;
  }
}