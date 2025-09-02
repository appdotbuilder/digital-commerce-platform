import { db } from '../db';
import { blogPostsTable, usersTable } from '../db/schema';
import { type CreateBlogPostInput, type BlogPost } from '../schema';
import { eq, desc, and, or, ilike, count } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

/**
 * Handler for creating a new blog post
 * This handler creates a new blog post by admin users
 */
export async function createBlogPost(input: CreateBlogPostInput): Promise<BlogPost> {
  try {
    // Verify the author exists and is an admin
    const author = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.author_id))
      .execute();

    if (author.length === 0) {
      throw new Error('Author not found');
    }

    if (author[0].role !== 'admin') {
      throw new Error('Only admin users can create blog posts');
    }

    // Check if slug is unique
    const existingPost = await db.select()
      .from(blogPostsTable)
      .where(eq(blogPostsTable.slug, input.slug))
      .execute();

    if (existingPost.length > 0) {
      throw new Error('Blog post with this slug already exists');
    }

    // Set published_at if the post is being published
    const publishedAt = input.is_published ? new Date() : null;

    // Insert blog post
    const result = await db.insert(blogPostsTable)
      .values({
        title: input.title,
        slug: input.slug,
        content: input.content,
        excerpt: input.excerpt,
        featured_image: input.featured_image,
        author_id: input.author_id,
        is_published: input.is_published,
        published_at: publishedAt
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Blog post creation failed:', error);
    throw error;
  }
}

/**
 * Handler for getting all blog posts for admin
 * This handler retrieves all blog posts including unpublished ones
 */
export async function getAllBlogPosts(): Promise<(BlogPost & { author: { first_name: string; last_name: string } })[]> {
  try {
    const results = await db.select()
      .from(blogPostsTable)
      .innerJoin(usersTable, eq(blogPostsTable.author_id, usersTable.id))
      .orderBy(desc(blogPostsTable.created_at))
      .execute();

    return results.map(result => ({
      ...result.blog_posts,
      author: {
        first_name: result.users.first_name,
        last_name: result.users.last_name
      }
    }));
  } catch (error) {
    console.error('Failed to get all blog posts:', error);
    throw error;
  }
}

/**
 * Handler for getting published blog posts for public
 * This handler retrieves only published blog posts for public display
 */
export async function getPublishedBlogPosts(page = 1, limit = 10): Promise<{
  posts: (BlogPost & { author: { first_name: string; last_name: string } })[];
  total: number;
  page: number;
  limit: number;
}> {
  try {
    const offset = (page - 1) * limit;

    // Get total count of published posts
    const totalResult = await db.select({ count: count() })
      .from(blogPostsTable)
      .where(eq(blogPostsTable.is_published, true))
      .execute();

    const total = totalResult[0].count;

    // Get paginated published posts
    const results = await db.select()
      .from(blogPostsTable)
      .innerJoin(usersTable, eq(blogPostsTable.author_id, usersTable.id))
      .where(eq(blogPostsTable.is_published, true))
      .orderBy(desc(blogPostsTable.published_at))
      .limit(limit)
      .offset(offset)
      .execute();

    const posts = results.map(result => ({
      ...result.blog_posts,
      author: {
        first_name: result.users.first_name,
        last_name: result.users.last_name
      }
    }));

    return {
      posts,
      total,
      page,
      limit
    };
  } catch (error) {
    console.error('Failed to get published blog posts:', error);
    throw error;
  }
}

/**
 * Handler for getting a single blog post by slug
 * This handler retrieves a blog post by its slug for public viewing
 */
export async function getBlogPostBySlug(slug: string): Promise<(BlogPost & { author: { first_name: string; last_name: string } }) | null> {
  try {
    const results = await db.select()
      .from(blogPostsTable)
      .innerJoin(usersTable, eq(blogPostsTable.author_id, usersTable.id))
      .where(and(
        eq(blogPostsTable.slug, slug),
        eq(blogPostsTable.is_published, true)
      ))
      .execute();

    if (results.length === 0) {
      return null;
    }

    const result = results[0];
    return {
      ...result.blog_posts,
      author: {
        first_name: result.users.first_name,
        last_name: result.users.last_name
      }
    };
  } catch (error) {
    console.error('Failed to get blog post by slug:', error);
    throw error;
  }
}

/**
 * Handler for getting a single blog post by ID
 * This handler retrieves a blog post by ID for admin purposes
 */
export async function getBlogPostById(id: number): Promise<BlogPost | null> {
  try {
    const results = await db.select()
      .from(blogPostsTable)
      .where(eq(blogPostsTable.id, id))
      .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Failed to get blog post by ID:', error);
    throw error;
  }
}

/**
 * Handler for updating a blog post
 * This handler updates an existing blog post
 */
export async function updateBlogPost(id: number, input: Partial<CreateBlogPostInput>): Promise<BlogPost | null> {
  try {
    // Check if blog post exists
    const existingPost = await getBlogPostById(id);
    if (!existingPost) {
      return null;
    }

    // Check slug uniqueness if being changed
    if (input.slug && input.slug !== existingPost.slug) {
      const slugConflict = await db.select()
        .from(blogPostsTable)
        .where(eq(blogPostsTable.slug, input.slug))
        .execute();

      if (slugConflict.length > 0) {
        throw new Error('Blog post with this slug already exists');
      }
    }

    // Prepare update data
    const updateData: any = {
      ...input,
      updated_at: new Date()
    };

    // Handle publication status change
    if (input.is_published !== undefined) {
      if (input.is_published && !existingPost.is_published) {
        // Publishing the post
        updateData.published_at = new Date();
      } else if (!input.is_published && existingPost.is_published) {
        // Unpublishing the post
        updateData.published_at = null;
      }
    }

    // Update blog post
    const result = await db.update(blogPostsTable)
      .set(updateData)
      .where(eq(blogPostsTable.id, id))
      .returning()
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Failed to update blog post:', error);
    throw error;
  }
}

/**
 * Handler for publishing/unpublishing a blog post
 * This handler toggles the published status of a blog post
 */
export async function toggleBlogPostPublication(id: number, isPublished: boolean): Promise<BlogPost | null> {
  try {
    const existingPost = await getBlogPostById(id);
    if (!existingPost) {
      return null;
    }

    const updateData = {
      is_published: isPublished,
      published_at: isPublished ? new Date() : null,
      updated_at: new Date()
    };

    const result = await db.update(blogPostsTable)
      .set(updateData)
      .where(eq(blogPostsTable.id, id))
      .returning()
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Failed to toggle blog post publication:', error);
    throw error;
  }
}

/**
 * Handler for deleting a blog post
 * This handler removes a blog post from the database
 */
export async function deleteBlogPost(id: number): Promise<boolean> {
  try {
    const result = await db.delete(blogPostsTable)
      .where(eq(blogPostsTable.id, id))
      .returning()
      .execute();

    return result.length > 0;
  } catch (error) {
    console.error('Failed to delete blog post:', error);
    throw error;
  }
}

/**
 * Handler for getting recent blog posts
 * This handler retrieves the most recent published blog posts
 */
export async function getRecentBlogPosts(limit = 5): Promise<BlogPost[]> {
  try {
    const results = await db.select()
      .from(blogPostsTable)
      .where(eq(blogPostsTable.is_published, true))
      .orderBy(desc(blogPostsTable.published_at))
      .limit(limit)
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to get recent blog posts:', error);
    throw error;
  }
}

/**
 * Handler for searching blog posts
 * This handler performs search on blog post titles and content
 */
export async function searchBlogPosts(query: string, page = 1, limit = 10): Promise<{
  posts: (BlogPost & { author: { first_name: string; last_name: string } })[];
  total: number;
  page: number;
  limit: number;
}> {
  try {
    const offset = (page - 1) * limit;
    const searchPattern = `%${query}%`;

    const searchCondition = or(
      ilike(blogPostsTable.title, searchPattern),
      ilike(blogPostsTable.content, searchPattern)
    );

    const conditions: SQL<unknown>[] = [
      eq(blogPostsTable.is_published, true)
    ];

    if (searchCondition) {
      conditions.push(searchCondition);
    }

    // Get total count
    const totalResult = await db.select({ count: count() })
      .from(blogPostsTable)
      .where(and(...conditions))
      .execute();

    const total = totalResult[0].count;

    // Get search results
    const results = await db.select()
      .from(blogPostsTable)
      .innerJoin(usersTable, eq(blogPostsTable.author_id, usersTable.id))
      .where(and(...conditions))
      .orderBy(desc(blogPostsTable.published_at))
      .limit(limit)
      .offset(offset)
      .execute();

    const posts = results.map(result => ({
      ...result.blog_posts,
      author: {
        first_name: result.users.first_name,
        last_name: result.users.last_name
      }
    }));

    return {
      posts,
      total,
      page,
      limit
    };
  } catch (error) {
    console.error('Failed to search blog posts:', error);
    throw error;
  }
}