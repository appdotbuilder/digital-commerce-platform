import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { productsTable, categoriesTable } from '../db/schema';
import { type CreateProductInput } from '../schema';
import { createProduct } from '../handlers/products';
import { eq } from 'drizzle-orm';

// Test category data
const testCategory = {
  name: 'Software',
  description: 'Digital software products',
  slug: 'software'
};

// Complete test input with all fields
const testInput: CreateProductInput = {
  name: 'Test Product',
  description: 'A comprehensive product for testing purposes',
  short_description: 'Short test description',
  price: 29.99,
  category_id: 1, // Will be updated after category creation
  image_url: 'https://example.com/image.jpg',
  download_url: 'https://example.com/download.zip',
  file_size: 1024000,
  version: '1.0.0',
  license_type: 'single',
  stock_quantity: 50
};

// Minimal test input with only required fields
const minimalTestInput: CreateProductInput = {
  name: 'Minimal Product',
  description: 'A minimal product with only required fields',
  short_description: null,
  price: 19.99,
  category_id: 1, // Will be updated after category creation
  image_url: null,
  download_url: null,
  file_size: null,
  version: null,
  license_type: null,
  stock_quantity: 0
};

describe('createProduct', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a product with all fields', async () => {
    // Create prerequisite category
    const categoryResult = await db.insert(categoriesTable)
      .values(testCategory)
      .returning()
      .execute();
    
    const updatedInput = { ...testInput, category_id: categoryResult[0].id };
    const result = await createProduct(updatedInput);

    // Verify all field values
    expect(result.name).toEqual('Test Product');
    expect(result.description).toEqual('A comprehensive product for testing purposes');
    expect(result.short_description).toEqual('Short test description');
    expect(result.price).toEqual(29.99);
    expect(typeof result.price).toBe('number');
    expect(result.category_id).toEqual(categoryResult[0].id);
    expect(result.image_url).toEqual('https://example.com/image.jpg');
    expect(result.download_url).toEqual('https://example.com/download.zip');
    expect(result.file_size).toEqual(1024000);
    expect(result.version).toEqual('1.0.0');
    expect(result.license_type).toEqual('single');
    expect(result.stock_quantity).toEqual(50);
    expect(result.is_active).toBe(true);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create a product with minimal fields', async () => {
    // Create prerequisite category
    const categoryResult = await db.insert(categoriesTable)
      .values(testCategory)
      .returning()
      .execute();
    
    const updatedInput = { ...minimalTestInput, category_id: categoryResult[0].id };
    const result = await createProduct(updatedInput);

    // Verify required fields
    expect(result.name).toEqual('Minimal Product');
    expect(result.description).toEqual('A minimal product with only required fields');
    expect(result.price).toEqual(19.99);
    expect(typeof result.price).toBe('number');
    expect(result.category_id).toEqual(categoryResult[0].id);
    expect(result.stock_quantity).toEqual(0);

    // Verify nullable fields are properly handled
    expect(result.short_description).toBeNull();
    expect(result.image_url).toBeNull();
    expect(result.download_url).toBeNull();
    expect(result.file_size).toBeNull();
    expect(result.version).toBeNull();
    expect(result.license_type).toBeNull();

    // Verify defaults
    expect(result.is_active).toBe(true);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save product to database correctly', async () => {
    // Create prerequisite category
    const categoryResult = await db.insert(categoriesTable)
      .values(testCategory)
      .returning()
      .execute();
    
    const updatedInput = { ...testInput, category_id: categoryResult[0].id };
    const result = await createProduct(updatedInput);

    // Query the database to verify the product was saved
    const products = await db.select()
      .from(productsTable)
      .where(eq(productsTable.id, result.id))
      .execute();

    expect(products).toHaveLength(1);
    const savedProduct = products[0];
    
    expect(savedProduct.name).toEqual('Test Product');
    expect(savedProduct.description).toEqual('A comprehensive product for testing purposes');
    expect(parseFloat(savedProduct.price)).toEqual(29.99);
    expect(savedProduct.category_id).toEqual(categoryResult[0].id);
    expect(savedProduct.stock_quantity).toEqual(50);
    expect(savedProduct.is_active).toBe(true);
    expect(savedProduct.created_at).toBeInstanceOf(Date);
    expect(savedProduct.updated_at).toBeInstanceOf(Date);
  });

  it('should handle different license types correctly', async () => {
    // Create prerequisite category
    const categoryResult = await db.insert(categoriesTable)
      .values(testCategory)
      .returning()
      .execute();

    const licenseTypes = ['single', 'multi', 'unlimited'] as const;

    for (const licenseType of licenseTypes) {
      const input = { 
        ...testInput, 
        category_id: categoryResult[0].id,
        license_type: licenseType,
        name: `Product with ${licenseType} license`
      };
      
      const result = await createProduct(input);
      
      expect(result.license_type).toEqual(licenseType);
      expect(result.name).toEqual(`Product with ${licenseType} license`);
    }
  });

  it('should handle price precision correctly', async () => {
    // Create prerequisite category
    const categoryResult = await db.insert(categoriesTable)
      .values(testCategory)
      .returning()
      .execute();

    const precisionPrices = [0.01, 999.99, 1234.56, 9999.99];

    for (const price of precisionPrices) {
      const input = { 
        ...testInput, 
        category_id: categoryResult[0].id,
        price: price,
        name: `Product price ${price}`
      };
      
      const result = await createProduct(input);
      
      expect(result.price).toEqual(price);
      expect(typeof result.price).toBe('number');
    }
  });

  it('should throw error when category does not exist', async () => {
    const invalidInput = { ...testInput, category_id: 999 };

    await expect(createProduct(invalidInput)).rejects.toThrow(/Category with id 999 not found/i);
  });

  it('should create multiple products in same category', async () => {
    // Create prerequisite category
    const categoryResult = await db.insert(categoriesTable)
      .values(testCategory)
      .returning()
      .execute();

    const product1Input = { 
      ...testInput, 
      category_id: categoryResult[0].id,
      name: 'Product 1'
    };
    
    const product2Input = { 
      ...testInput, 
      category_id: categoryResult[0].id,
      name: 'Product 2'
    };

    const result1 = await createProduct(product1Input);
    const result2 = await createProduct(product2Input);

    expect(result1.name).toEqual('Product 1');
    expect(result2.name).toEqual('Product 2');
    expect(result1.category_id).toEqual(result2.category_id);
    expect(result1.id).not.toEqual(result2.id);

    // Verify both products exist in database
    const products = await db.select()
      .from(productsTable)
      .where(eq(productsTable.category_id, categoryResult[0].id))
      .execute();

    expect(products).toHaveLength(2);
  });

  it('should create products with different stock quantities', async () => {
    // Create prerequisite category
    const categoryResult = await db.insert(categoriesTable)
      .values(testCategory)
      .returning()
      .execute();

    const stockQuantities = [0, 1, 10, 100, 1000];

    for (const stock_quantity of stockQuantities) {
      const input = { 
        ...testInput, 
        category_id: categoryResult[0].id,
        stock_quantity: stock_quantity,
        name: `Product stock ${stock_quantity}`
      };
      
      const result = await createProduct(input);
      
      expect(result.stock_quantity).toEqual(stock_quantity);
      expect(result.name).toEqual(`Product stock ${stock_quantity}`);
    }
  });
});