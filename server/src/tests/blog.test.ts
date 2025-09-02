import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, blogPostsTable } from '../db/schema';
import { type CreateBlogPostInput, type CreateUserInput } from '../schema';
import {
  createBlogPost,
  getAllBlogPosts,
  getPublishedBlogPosts,
  getBlogPostBySlug,
  getBlogPostById,
  updateBlogPost,
  toggleBlogPostPublication,
  deleteBlogPost,
  getRecentBlogPosts,
  searchBlogPosts
} from '../handlers/blog';
import { eq } from 'drizzle-orm';

// Test data setup
const createTestUser = async (role: 'admin' | 'customer' = 'admin') => {
  const userData: CreateUserInput = {
    email: `test-${role}@example.com`,
    password: 'password123',
    first_name: 'Test',
    last_name: 'User',
    role
  };

  const result = await db.insert(usersTable)
    .values({
      email: userData.email,
      password_hash: 'hashed_password',
      first_name: userData.first_name,
      last_name: userData.last_name,
      role: userData.role,
      is_active: true
    })
    .returning()
    .execute();

  return result[0];
};

const testBlogPostInput: CreateBlogPostInput = {
  title: 'Test Blog Post',
  slug: 'test-blog-post',
  content: 'This is the content of the test blog post.',
  excerpt: 'This is a test excerpt',
  featured_image: 'https://example.com/image.jpg',
  author_id: 1,
  is_published: true
};

describe('Blog Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createBlogPost', () => {
    it('should create a blog post by admin user', async () => {
      const admin = await createTestUser('admin');
      const input = { ...testBlogPostInput, author_id: admin.id };

      const result = await createBlogPost(input);

      expect(result.title).toEqual('Test Blog Post');
      expect(result.slug).toEqual('test-blog-post');
      expect(result.content).toEqual(input.content);
      expect(result.excerpt).toEqual(input.excerpt);
      expect(result.featured_image).toEqual(input.featured_image);
      expect(result.author_id).toEqual(admin.id);
      expect(result.is_published).toBe(true);
      expect(result.published_at).toBeInstanceOf(Date);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create unpublished blog post with null published_at', async () => {
      const admin = await createTestUser('admin');
      const input = { ...testBlogPostInput, author_id: admin.id, is_published: false };

      const result = await createBlogPost(input);

      expect(result.is_published).toBe(false);
      expect(result.published_at).toBeNull();
    });

    it('should save blog post to database', async () => {
      const admin = await createTestUser('admin');
      const input = { ...testBlogPostInput, author_id: admin.id };

      const result = await createBlogPost(input);

      const posts = await db.select()
        .from(blogPostsTable)
        .where(eq(blogPostsTable.id, result.id))
        .execute();

      expect(posts).toHaveLength(1);
      expect(posts[0].title).toEqual('Test Blog Post');
      expect(posts[0].slug).toEqual('test-blog-post');
      expect(posts[0].author_id).toEqual(admin.id);
    });

    it('should throw error if author not found', async () => {
      const input = { ...testBlogPostInput, author_id: 999 };

      await expect(createBlogPost(input)).rejects.toThrow(/Author not found/i);
    });

    it('should throw error if author is not admin', async () => {
      const customer = await createTestUser('customer');
      const input = { ...testBlogPostInput, author_id: customer.id };

      await expect(createBlogPost(input)).rejects.toThrow(/Only admin users can create blog posts/i);
    });

    it('should throw error if slug already exists', async () => {
      const admin = await createTestUser('admin');
      const input = { ...testBlogPostInput, author_id: admin.id };

      await createBlogPost(input);
      
      await expect(createBlogPost(input)).rejects.toThrow(/Blog post with this slug already exists/i);
    });
  });

  describe('getAllBlogPosts', () => {
    it('should return all blog posts with author information', async () => {
      const admin = await createTestUser('admin');
      
      // Create multiple blog posts
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id });
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id, slug: 'second-post', title: 'Second Post' });

      const result = await getAllBlogPosts();

      expect(result).toHaveLength(2);
      expect(result[0].title).toEqual('Second Post'); // Should be ordered by created_at desc
      expect(result[0].author.first_name).toEqual('Test');
      expect(result[0].author.last_name).toEqual('User');
      expect(result[1].title).toEqual('Test Blog Post');
    });

    it('should include both published and unpublished posts', async () => {
      const admin = await createTestUser('admin');
      
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id, is_published: true });
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id, slug: 'unpublished', is_published: false });

      const result = await getAllBlogPosts();

      expect(result).toHaveLength(2);
      expect(result.some(post => post.is_published)).toBe(true);
      expect(result.some(post => !post.is_published)).toBe(true);
    });

    it('should return empty array when no posts exist', async () => {
      const result = await getAllBlogPosts();
      expect(result).toHaveLength(0);
    });
  });

  describe('getPublishedBlogPosts', () => {
    it('should return only published posts with pagination', async () => {
      const admin = await createTestUser('admin');
      
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id, is_published: true });
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id, slug: 'unpublished', is_published: false });
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id, slug: 'published-2', is_published: true });

      const result = await getPublishedBlogPosts(1, 10);

      expect(result.posts).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.posts.every(post => post.is_published)).toBe(true);
      expect(result.posts[0].author.first_name).toEqual('Test');
    });

    it('should handle pagination correctly', async () => {
      const admin = await createTestUser('admin');
      
      // Create 3 published posts
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id, slug: 'post-1' });
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id, slug: 'post-2' });
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id, slug: 'post-3' });

      const page1 = await getPublishedBlogPosts(1, 2);
      expect(page1.posts).toHaveLength(2);
      expect(page1.total).toBe(3);

      const page2 = await getPublishedBlogPosts(2, 2);
      expect(page2.posts).toHaveLength(1);
      expect(page2.total).toBe(3);
    });

    it('should return empty results when no published posts exist', async () => {
      const result = await getPublishedBlogPosts();

      expect(result.posts).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getBlogPostBySlug', () => {
    it('should return published blog post by slug with author info', async () => {
      const admin = await createTestUser('admin');
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id });

      const result = await getBlogPostBySlug('test-blog-post');

      expect(result).not.toBeNull();
      expect(result!.title).toEqual('Test Blog Post');
      expect(result!.slug).toEqual('test-blog-post');
      expect(result!.author.first_name).toEqual('Test');
      expect(result!.author.last_name).toEqual('User');
    });

    it('should not return unpublished posts', async () => {
      const admin = await createTestUser('admin');
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id, is_published: false });

      const result = await getBlogPostBySlug('test-blog-post');

      expect(result).toBeNull();
    });

    it('should return null for non-existent slug', async () => {
      const result = await getBlogPostBySlug('non-existent-slug');
      expect(result).toBeNull();
    });
  });

  describe('getBlogPostById', () => {
    it('should return blog post by ID', async () => {
      const admin = await createTestUser('admin');
      const post = await createBlogPost({ ...testBlogPostInput, author_id: admin.id });

      const result = await getBlogPostById(post.id);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(post.id);
      expect(result!.title).toEqual('Test Blog Post');
    });

    it('should return both published and unpublished posts', async () => {
      const admin = await createTestUser('admin');
      const unpublishedPost = await createBlogPost({ 
        ...testBlogPostInput, 
        author_id: admin.id, 
        is_published: false 
      });

      const result = await getBlogPostById(unpublishedPost.id);

      expect(result).not.toBeNull();
      expect(result!.is_published).toBe(false);
    });

    it('should return null for non-existent ID', async () => {
      const result = await getBlogPostById(999);
      expect(result).toBeNull();
    });
  });

  describe('updateBlogPost', () => {
    it('should update existing blog post', async () => {
      const admin = await createTestUser('admin');
      const post = await createBlogPost({ ...testBlogPostInput, author_id: admin.id });

      const updateData = {
        title: 'Updated Title',
        content: 'Updated content'
      };

      const result = await updateBlogPost(post.id, updateData);

      expect(result).not.toBeNull();
      expect(result!.title).toEqual('Updated Title');
      expect(result!.content).toEqual('Updated content');
      expect(result!.slug).toEqual('test-blog-post'); // Unchanged
    });

    it('should handle slug updates with uniqueness check', async () => {
      const admin = await createTestUser('admin');
      const post1 = await createBlogPost({ ...testBlogPostInput, author_id: admin.id });
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id, slug: 'existing-slug', title: 'Other Post' });

      // Should fail with duplicate slug
      await expect(
        updateBlogPost(post1.id, { slug: 'existing-slug' })
      ).rejects.toThrow(/Blog post with this slug already exists/i);

      // Should succeed with unique slug
      const result = await updateBlogPost(post1.id, { slug: 'new-unique-slug' });
      expect(result!.slug).toEqual('new-unique-slug');
    });

    it('should handle publication status changes', async () => {
      const admin = await createTestUser('admin');
      const post = await createBlogPost({ ...testBlogPostInput, author_id: admin.id, is_published: false });

      // Publish the post
      const result = await updateBlogPost(post.id, { is_published: true });
      expect(result!.is_published).toBe(true);
      expect(result!.published_at).toBeInstanceOf(Date);

      // Unpublish the post
      const unpublished = await updateBlogPost(post.id, { is_published: false });
      expect(unpublished!.is_published).toBe(false);
      expect(unpublished!.published_at).toBeNull();
    });

    it('should return null for non-existent post', async () => {
      const result = await updateBlogPost(999, { title: 'New Title' });
      expect(result).toBeNull();
    });
  });

  describe('toggleBlogPostPublication', () => {
    it('should publish unpublished post', async () => {
      const admin = await createTestUser('admin');
      const post = await createBlogPost({ ...testBlogPostInput, author_id: admin.id, is_published: false });

      const result = await toggleBlogPostPublication(post.id, true);

      expect(result).not.toBeNull();
      expect(result!.is_published).toBe(true);
      expect(result!.published_at).toBeInstanceOf(Date);
    });

    it('should unpublish published post', async () => {
      const admin = await createTestUser('admin');
      const post = await createBlogPost({ ...testBlogPostInput, author_id: admin.id, is_published: true });

      const result = await toggleBlogPostPublication(post.id, false);

      expect(result).not.toBeNull();
      expect(result!.is_published).toBe(false);
      expect(result!.published_at).toBeNull();
    });

    it('should return null for non-existent post', async () => {
      const result = await toggleBlogPostPublication(999, true);
      expect(result).toBeNull();
    });
  });

  describe('deleteBlogPost', () => {
    it('should delete existing blog post', async () => {
      const admin = await createTestUser('admin');
      const post = await createBlogPost({ ...testBlogPostInput, author_id: admin.id });

      const result = await deleteBlogPost(post.id);
      expect(result).toBe(true);

      // Verify deletion
      const deletedPost = await getBlogPostById(post.id);
      expect(deletedPost).toBeNull();
    });

    it('should return false for non-existent post', async () => {
      const result = await deleteBlogPost(999);
      expect(result).toBe(false);
    });
  });

  describe('getRecentBlogPosts', () => {
    it('should return recent published posts in order', async () => {
      const admin = await createTestUser('admin');
      
      // Create posts with slight delays to ensure different published_at times
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id, slug: 'old-post' });
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id, slug: 'newer-post' });
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id, slug: 'unpublished', is_published: false });

      const result = await getRecentBlogPosts(5);

      expect(result).toHaveLength(2); // Only published posts
      expect(result[0].slug).toEqual('newer-post'); // Most recent first
      expect(result[1].slug).toEqual('old-post');
    });

    it('should respect limit parameter', async () => {
      const admin = await createTestUser('admin');
      
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id, slug: 'post-1' });
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id, slug: 'post-2' });
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id, slug: 'post-3' });

      const result = await getRecentBlogPosts(2);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no published posts exist', async () => {
      const result = await getRecentBlogPosts();
      expect(result).toHaveLength(0);
    });
  });

  describe('searchBlogPosts', () => {
    it('should search in title and content', async () => {
      const admin = await createTestUser('admin');
      
      await createBlogPost({ 
        ...testBlogPostInput, 
        author_id: admin.id, 
        title: 'JavaScript Tutorial',
        content: 'Learn JavaScript basics',
        slug: 'js-tutorial'
      });
      await createBlogPost({ 
        ...testBlogPostInput, 
        author_id: admin.id, 
        title: 'Python Guide',
        content: 'Advanced JavaScript concepts',
        slug: 'python-guide'
      });
      await createBlogPost({ 
        ...testBlogPostInput, 
        author_id: admin.id, 
        title: 'Ruby Tips',
        content: 'Ruby programming tips',
        slug: 'ruby-tips'
      });

      const result = await searchBlogPosts('JavaScript', 1, 10);

      expect(result.posts).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.posts.every(post => 
        post.title.toLowerCase().includes('javascript') || 
        post.content.toLowerCase().includes('javascript')
      )).toBe(true);
    });

    it('should only return published posts', async () => {
      const admin = await createTestUser('admin');
      
      await createBlogPost({ 
        ...testBlogPostInput, 
        author_id: admin.id, 
        title: 'Published JavaScript',
        is_published: true,
        slug: 'published-js'
      });
      await createBlogPost({ 
        ...testBlogPostInput, 
        author_id: admin.id, 
        title: 'Draft JavaScript',
        is_published: false,
        slug: 'draft-js'
      });

      const result = await searchBlogPosts('JavaScript', 1, 10);

      expect(result.posts).toHaveLength(1);
      expect(result.posts[0].title).toEqual('Published JavaScript');
    });

    it('should handle pagination in search results', async () => {
      const admin = await createTestUser('admin');
      
      // Create multiple posts with search term
      for (let i = 1; i <= 3; i++) {
        await createBlogPost({ 
          ...testBlogPostInput, 
          author_id: admin.id, 
          title: `Test Post ${i}`,
          slug: `test-post-${i}`
        });
      }

      const page1 = await searchBlogPosts('Test', 1, 2);
      expect(page1.posts).toHaveLength(2);
      expect(page1.total).toBe(3);

      const page2 = await searchBlogPosts('Test', 2, 2);
      expect(page2.posts).toHaveLength(1);
      expect(page2.total).toBe(3);
    });

    it('should return empty results for non-matching search', async () => {
      const admin = await createTestUser('admin');
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id });

      const result = await searchBlogPosts('nonexistent term', 1, 10);

      expect(result.posts).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should include author information in search results', async () => {
      const admin = await createTestUser('admin');
      await createBlogPost({ ...testBlogPostInput, author_id: admin.id });

      const result = await searchBlogPosts('Test Blog', 1, 10);

      expect(result.posts).toHaveLength(1);
      expect(result.posts[0].author.first_name).toEqual('Test');
      expect(result.posts[0].author.last_name).toEqual('User');
    });
  });
});