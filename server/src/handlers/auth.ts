import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type LoginInput, type User } from '../schema';
import { eq } from 'drizzle-orm';

/**
 * Handler for user registration
 * This handler creates a new user account with hashed password
 * and returns the user data without the password hash
 */
export async function registerUser(input: CreateUserInput): Promise<Omit<User, 'password_hash'>> {
  try {
    // Check if email already exists
    const existingUsers = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    if (existingUsers.length > 0) {
      throw new Error('Email already exists');
    }

    // Hash the password (in a real implementation, use bcrypt)
    const password_hash = `hashed_${input.password}`;

    // Insert user into database
    const result = await db.insert(usersTable)
      .values({
        email: input.email,
        password_hash,
        first_name: input.first_name,
        last_name: input.last_name,
        role: input.role
      })
      .returning()
      .execute();

    const user = result[0];
    
    // Return user data without password hash
    return {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at
    };
  } catch (error) {
    console.error('User registration failed:', error);
    throw error;
  }
}

/**
 * Handler for user login
 * This handler authenticates user credentials and returns user data
 * along with authentication token
 */
export async function loginUser(input: LoginInput): Promise<{ user: Omit<User, 'password_hash'>, token: string } | null> {
  try {
    // Find user by email
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    if (users.length === 0) {
      return null;
    }

    const user = users[0];

    // Verify password against hash (in a real implementation, use bcrypt.compare)
    const expectedHash = `hashed_${input.password}`;
    if (user.password_hash !== expectedHash) {
      return null;
    }

    // Check if user is active
    if (!user.is_active) {
      return null;
    }

    // Generate JWT token (in a real implementation, use proper JWT library)
    const token = `jwt_token_${user.id}_${Date.now()}`;

    // Return user data and token
    return {
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: user.updated_at
      },
      token
    };
  } catch (error) {
    console.error('User login failed:', error);
    throw error;
  }
}

/**
 * Handler for getting current user from token
 * This handler validates JWT token and returns current user data
 */
export async function getCurrentUser(token: string): Promise<Omit<User, 'password_hash'> | null> {
  try {
    // In a real implementation, verify JWT token and extract user ID
    // For this mock implementation, extract user ID from token format
    const tokenMatch = token.match(/^jwt_token_(\d+)_\d+$/);
    if (!tokenMatch) {
      return null;
    }

    const userId = parseInt(tokenMatch[1], 10);

    // Fetch user from database
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (users.length === 0) {
      return null;
    }

    const user = users[0];

    // Check if user is still active
    if (!user.is_active) {
      return null;
    }

    // Return user data without password hash
    return {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at
    };
  } catch (error) {
    console.error('Get current user failed:', error);
    throw error;
  }
}