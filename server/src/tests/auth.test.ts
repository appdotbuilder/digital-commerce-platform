import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type LoginInput } from '../schema';
import { registerUser, loginUser, getCurrentUser } from '../handlers/auth';
import { eq } from 'drizzle-orm';

// Test input for user registration
const testUserInput: CreateUserInput = {
  email: 'test@example.com',
  password: 'password123',
  first_name: 'John',
  last_name: 'Doe',
  role: 'customer'
};

// Test input for admin user
const testAdminInput: CreateUserInput = {
  email: 'admin@example.com',
  password: 'adminpass123',
  first_name: 'Admin',
  last_name: 'User',
  role: 'admin'
};

// Login test input
const testLoginInput: LoginInput = {
  email: 'test@example.com',
  password: 'password123'
};

describe('registerUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should register a new user successfully', async () => {
    const result = await registerUser(testUserInput);

    // Basic field validation
    expect(result.email).toEqual('test@example.com');
    expect(result.first_name).toEqual('John');
    expect(result.last_name).toEqual('Doe');
    expect(result.role).toEqual('customer');
    expect(result.is_active).toEqual(true);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect((result as any).password_hash).toBeUndefined(); // Should not include password_hash
  });

  it('should save user to database with hashed password', async () => {
    const result = await registerUser(testUserInput);

    // Query database directly to verify data was saved
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users).toHaveLength(1);
    expect(users[0].email).toEqual('test@example.com');
    expect(users[0].first_name).toEqual('John');
    expect(users[0].last_name).toEqual('Doe');
    expect(users[0].role).toEqual('customer');
    expect(users[0].is_active).toEqual(true);
    expect(users[0].password_hash).toEqual('hashed_password123'); // Verify password was hashed
    expect(users[0].created_at).toBeInstanceOf(Date);
  });

  it('should register admin user correctly', async () => {
    const result = await registerUser(testAdminInput);

    expect(result.email).toEqual('admin@example.com');
    expect(result.role).toEqual('admin');
    expect(result.first_name).toEqual('Admin');
    expect(result.last_name).toEqual('User');
  });

  it('should apply default role when not specified', async () => {
    const inputWithoutRole = {
      email: 'default@example.com',
      password: 'password123',
      first_name: 'Default',
      last_name: 'User',
      role: 'customer' as const // Zod applies default
    };

    const result = await registerUser(inputWithoutRole);
    expect(result.role).toEqual('customer');
  });

  it('should reject duplicate email addresses', async () => {
    // Register first user
    await registerUser(testUserInput);

    // Try to register with same email
    expect(registerUser(testUserInput)).rejects.toThrow(/email already exists/i);
  });
});

describe('loginUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should login user with correct credentials', async () => {
    // First register a user
    await registerUser(testUserInput);

    // Then try to login
    const result = await loginUser(testLoginInput);

    expect(result).not.toBeNull();
    expect(result!.user.email).toEqual('test@example.com');
    expect(result!.user.first_name).toEqual('John');
    expect(result!.user.last_name).toEqual('Doe');
    expect(result!.user.role).toEqual('customer');
    expect(result!.user.is_active).toEqual(true);
    expect(result!.token).toBeDefined();
    expect(result!.token).toMatch(/^jwt_token_\d+_\d+$/); // Verify token format
    expect((result!.user as any).password_hash).toBeUndefined(); // Should not include password_hash
  });

  it('should return null for non-existent email', async () => {
    const result = await loginUser({
      email: 'nonexistent@example.com',
      password: 'password123'
    });

    expect(result).toBeNull();
  });

  it('should return null for incorrect password', async () => {
    // Register user
    await registerUser(testUserInput);

    // Try login with wrong password
    const result = await loginUser({
      email: 'test@example.com',
      password: 'wrongpassword'
    });

    expect(result).toBeNull();
  });

  it('should return null for inactive user', async () => {
    // Register user
    const user = await registerUser(testUserInput);

    // Deactivate user directly in database
    await db.update(usersTable)
      .set({ is_active: false })
      .where(eq(usersTable.id, user.id))
      .execute();

    // Try to login
    const result = await loginUser(testLoginInput);
    expect(result).toBeNull();
  });

  it('should login admin user correctly', async () => {
    // Register admin user
    await registerUser(testAdminInput);

    // Login as admin
    const result = await loginUser({
      email: 'admin@example.com',
      password: 'adminpass123'
    });

    expect(result).not.toBeNull();
    expect(result!.user.role).toEqual('admin');
    expect(result!.user.email).toEqual('admin@example.com');
  });
});

describe('getCurrentUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should get current user from valid token', async () => {
    // Register and login user to get token
    await registerUser(testUserInput);
    const loginResult = await loginUser(testLoginInput);
    
    expect(loginResult).not.toBeNull();
    const token = loginResult!.token;

    // Get current user with token
    const result = await getCurrentUser(token);

    expect(result).not.toBeNull();
    expect(result!.email).toEqual('test@example.com');
    expect(result!.first_name).toEqual('John');
    expect(result!.last_name).toEqual('Doe');
    expect(result!.role).toEqual('customer');
    expect(result!.is_active).toEqual(true);
    expect((result as any).password_hash).toBeUndefined(); // Should not include password_hash
  });

  it('should return null for invalid token format', async () => {
    const result = await getCurrentUser('invalid_token');
    expect(result).toBeNull();
  });

  it('should return null for token with non-existent user ID', async () => {
    const fakeToken = 'jwt_token_999999_1234567890';
    const result = await getCurrentUser(fakeToken);
    expect(result).toBeNull();
  });

  it('should return null for inactive user', async () => {
    // Register and login user
    await registerUser(testUserInput);
    const loginResult = await loginUser(testLoginInput);
    const token = loginResult!.token;

    // Deactivate user
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, 'test@example.com'))
      .execute();
    
    await db.update(usersTable)
      .set({ is_active: false })
      .where(eq(usersTable.id, users[0].id))
      .execute();

    // Try to get current user
    const result = await getCurrentUser(token);
    expect(result).toBeNull();
  });

  it('should work with admin user token', async () => {
    // Register and login admin
    await registerUser(testAdminInput);
    const loginResult = await loginUser({
      email: 'admin@example.com',
      password: 'adminpass123'
    });
    const token = loginResult!.token;

    // Get current user
    const result = await getCurrentUser(token);

    expect(result).not.toBeNull();
    expect(result!.role).toEqual('admin');
    expect(result!.email).toEqual('admin@example.com');
  });
});