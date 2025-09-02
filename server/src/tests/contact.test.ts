import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { settingsTable } from '../db/schema';
import { type ContactFormInput } from '../schema';
import { eq } from 'drizzle-orm';
import {
  submitContactForm,
  getContactSubmissions,
  markContactSubmissionAsRead,
  replyToContactSubmission,
  getContactSubmissionStats,
  deleteContactSubmission,
  exportContactSubmissions,
  type ContactSubmission
} from '../handlers/contact';

// Test contact form input
const testContactInput: ContactFormInput = {
  name: 'John Doe',
  email: 'john.doe@example.com',
  subject: 'Test Subject',
  message: 'This is a test message for the contact form.'
};

const testContactInput2: ContactFormInput = {
  name: 'Jane Smith',
  email: 'jane.smith@example.com',
  subject: 'Another Test',
  message: 'This is another test message.'
};

describe('Contact Form Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('submitContactForm', () => {
    it('should submit a contact form successfully', async () => {
      const result = await submitContactForm(testContactInput);

      expect(result.success).toBe(true);
      expect(result.message).toEqual('Thank you for your message. We will get back to you soon.');
    });

    it('should store contact form data in database', async () => {
      await submitContactForm(testContactInput);

      // Check that data was stored in settings table
      const submissions = await db.select()
        .from(settingsTable)
        .execute();

      const contactSubmissions = submissions.filter(s => s.key.startsWith('contact_'));
      expect(contactSubmissions).toHaveLength(1);

      const storedData = JSON.parse(contactSubmissions[0].value);
      expect(storedData.name).toEqual(testContactInput.name);
      expect(storedData.email).toEqual(testContactInput.email);
      expect(storedData.subject).toEqual(testContactInput.subject);
      expect(storedData.message).toEqual(testContactInput.message);
      expect(storedData.status).toEqual('new');
      expect(storedData.created_at).toBeDefined();
    });

    it('should create unique keys for multiple submissions', async () => {
      await submitContactForm(testContactInput);
      await submitContactForm(testContactInput2);

      const submissions = await db.select()
        .from(settingsTable)
        .execute();

      const contactSubmissions = submissions.filter(s => s.key.startsWith('contact_'));
      expect(contactSubmissions).toHaveLength(2);

      // Keys should be unique
      const keys = contactSubmissions.map(s => s.key);
      expect(new Set(keys).size).toEqual(2);
    });
  });

  describe('getContactSubmissions', () => {
    it('should return empty array when no submissions exist', async () => {
      const result = await getContactSubmissions();
      expect(result).toEqual([]);
    });

    it('should retrieve contact submissions', async () => {
      await submitContactForm(testContactInput);
      await submitContactForm(testContactInput2);

      const result = await getContactSubmissions();

      expect(result).toHaveLength(2);
      
      // Check first submission
      const submission1 = result.find(s => s.email === testContactInput.email);
      expect(submission1).toBeDefined();
      expect(submission1!.name).toEqual(testContactInput.name);
      expect(submission1!.subject).toEqual(testContactInput.subject);
      expect(submission1!.message).toEqual(testContactInput.message);
      expect(submission1!.status).toEqual('new');
      expect(submission1!.id).toBeDefined();
      expect(submission1!.created_at).toBeInstanceOf(Date);

      // Check second submission
      const submission2 = result.find(s => s.email === testContactInput2.email);
      expect(submission2).toBeDefined();
      expect(submission2!.name).toEqual(testContactInput2.name);
    });

    it('should ignore non-contact settings', async () => {
      // Add a non-contact setting
      await db.insert(settingsTable)
        .values({
          key: 'other_setting',
          value: 'some value',
          description: 'Not a contact submission'
        })
        .execute();

      await submitContactForm(testContactInput);

      const result = await getContactSubmissions();
      expect(result).toHaveLength(1);
      expect(result[0].email).toEqual(testContactInput.email);
    });
  });

  describe('markContactSubmissionAsRead', () => {
    it('should mark a contact submission as read', async () => {
      await submitContactForm(testContactInput);
      
      const submissions = await getContactSubmissions();
      const submissionId = submissions[0].id;

      const result = await markContactSubmissionAsRead(submissionId);
      expect(result).toBe(true);

      // Verify status was updated
      const updatedSubmissions = await getContactSubmissions();
      const updatedSubmission = updatedSubmissions.find(s => s.id === submissionId);
      expect(updatedSubmission!.status).toEqual('read');
    });

    it('should return false for non-existent submission', async () => {
      const result = await markContactSubmissionAsRead(99999);
      expect(result).toBe(false);
    });

    it('should return false for non-contact setting', async () => {
      // Add a non-contact setting
      const nonContactSetting = await db.insert(settingsTable)
        .values({
          key: 'other_setting',
          value: 'some value',
          description: 'Not a contact submission'
        })
        .returning()
        .execute();

      const result = await markContactSubmissionAsRead(nonContactSetting[0].id);
      expect(result).toBe(false);
    });
  });

  describe('replyToContactSubmission', () => {
    it('should reply to a contact submission successfully', async () => {
      await submitContactForm(testContactInput);
      
      const submissions = await getContactSubmissions();
      const submissionId = submissions[0].id;
      const replyMessage = 'Thank you for contacting us. We will help you soon.';

      const result = await replyToContactSubmission(submissionId, replyMessage);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify status was updated to replied
      const updatedSubmissions = await getContactSubmissions();
      const updatedSubmission = updatedSubmissions.find(s => s.id === submissionId);
      expect(updatedSubmission!.status).toEqual('replied');
    });

    it('should return error for empty reply message', async () => {
      await submitContactForm(testContactInput);
      
      const submissions = await getContactSubmissions();
      const submissionId = submissions[0].id;

      const result = await replyToContactSubmission(submissionId, '');
      expect(result.success).toBe(false);
      expect(result.error).toEqual('Reply message cannot be empty');
    });

    it('should return error for whitespace-only reply message', async () => {
      await submitContactForm(testContactInput);
      
      const submissions = await getContactSubmissions();
      const submissionId = submissions[0].id;

      const result = await replyToContactSubmission(submissionId, '   ');
      expect(result.success).toBe(false);
      expect(result.error).toEqual('Reply message cannot be empty');
    });

    it('should return error for non-existent submission', async () => {
      const result = await replyToContactSubmission(99999, 'Test reply');
      expect(result.success).toBe(false);
      expect(result.error).toEqual('Contact submission not found');
    });
  });

  describe('getContactSubmissionStats', () => {
    it('should return zero stats when no submissions exist', async () => {
      const stats = await getContactSubmissionStats();

      expect(stats.total).toEqual(0);
      expect(stats.new).toEqual(0);
      expect(stats.read).toEqual(0);
      expect(stats.replied).toEqual(0);
      expect(stats.thisMonth).toEqual(0);
    });

    it('should calculate statistics correctly', async () => {
      // Create submissions with different statuses
      await submitContactForm(testContactInput);
      await submitContactForm(testContactInput2);
      
      const submissions = await getContactSubmissions();
      
      // Mark one as read and one as replied
      await markContactSubmissionAsRead(submissions[0].id);
      await replyToContactSubmission(submissions[1].id, 'Test reply');

      // Add another new submission
      await submitContactForm({
        name: 'Bob Wilson',
        email: 'bob@example.com',
        subject: 'Third Test',
        message: 'Third message'
      });

      const stats = await getContactSubmissionStats();

      expect(stats.total).toEqual(3);
      expect(stats.new).toEqual(1);
      expect(stats.read).toEqual(1);
      expect(stats.replied).toEqual(1);
      expect(stats.thisMonth).toEqual(3); // All submissions are from this month
    });
  });

  describe('deleteContactSubmission', () => {
    it('should delete a contact submission successfully', async () => {
      await submitContactForm(testContactInput);
      
      const submissions = await getContactSubmissions();
      const submissionId = submissions[0].id;

      const result = await deleteContactSubmission(submissionId);
      expect(result).toBe(true);

      // Verify submission was deleted
      const remainingSubmissions = await getContactSubmissions();
      expect(remainingSubmissions).toHaveLength(0);
    });

    it('should return false for non-existent submission', async () => {
      const result = await deleteContactSubmission(99999);
      expect(result).toBe(false);
    });

    it('should return false for non-contact setting', async () => {
      // Add a non-contact setting
      const nonContactSetting = await db.insert(settingsTable)
        .values({
          key: 'other_setting',
          value: 'some value',
          description: 'Not a contact submission'
        })
        .returning()
        .execute();

      const result = await deleteContactSubmission(nonContactSetting[0].id);
      expect(result).toBe(false);
    });
  });

  describe('exportContactSubmissions', () => {
    it('should return empty CSV with headers when no submissions exist', async () => {
      const result = await exportContactSubmissions();
      
      expect(result).toEqual('ID,Name,Email,Subject,Status,Created At,Message\n');
    });

    it('should export contact submissions to CSV', async () => {
      await submitContactForm(testContactInput);
      await submitContactForm(testContactInput2);

      const result = await exportContactSubmissions();

      // Check CSV structure
      const lines = result.split('\n');
      expect(lines[0]).toEqual('ID,Name,Email,Subject,Status,Created At,Message');
      expect(lines).toHaveLength(4); // Header + 2 submissions + empty line at end

      // Check that data is included
      expect(result).toContain(testContactInput.name);
      expect(result).toContain(testContactInput.email);
      expect(result).toContain(testContactInput.subject);
      expect(result).toContain(testContactInput2.name);
    });

    it('should handle CSV escaping for special characters', async () => {
      const specialInput: ContactFormInput = {
        name: 'John "Special" Doe',
        email: 'john@example.com',
        subject: 'Subject, with comma',
        message: 'Message\nwith\nnewlines'
      };

      await submitContactForm(specialInput);

      const result = await exportContactSubmissions();

      // Check that special characters are properly escaped
      expect(result).toContain('"John ""Special"" Doe"');
      expect(result).toContain('"Subject, with comma"');
      expect(result).toContain('"Message\nwith\nnewlines"');
    });

    it('should filter by date range', async () => {
      await submitContactForm(testContactInput);
      
      // Create a date range that excludes today
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const result = await exportContactSubmissions(twoDaysAgo, yesterday);

      // Should only have header since submission is from today
      const lines = result.split('\n').filter(line => line.trim());
      expect(lines).toHaveLength(1); // Only header
    });

    it('should include all submissions when date range includes them', async () => {
      await submitContactForm(testContactInput);
      
      // Create a date range that includes today
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await exportContactSubmissions(yesterday, tomorrow);

      // Should have header + 1 submission
      const lines = result.split('\n').filter(line => line.trim());
      expect(lines).toHaveLength(2); // Header + 1 submission
      expect(result).toContain(testContactInput.name);
    });
  });
});