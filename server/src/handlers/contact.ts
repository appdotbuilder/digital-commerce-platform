import { db } from '../db';
import { settingsTable } from '../db/schema';
import { type ContactFormInput } from '../schema';
import { eq, desc, and, gte, lte } from 'drizzle-orm';

// Contact form submission type
export interface ContactSubmission extends ContactFormInput {
  id: number;
  created_at: Date;
  status: 'new' | 'read' | 'replied';
}

/**
 * Handler for processing contact form submissions
 * This handler processes contact form data and stores it in the settings table
 */
export const submitContactForm = async (input: ContactFormInput): Promise<{ success: boolean; message: string }> => {
  try {
    // Create a unique key for this contact submission
    const timestamp = Date.now();
    const key = `contact_${timestamp}`;
    
    // Store the contact form data as JSON in the settings table
    const contactData = {
      ...input,
      status: 'new',
      created_at: new Date().toISOString()
    };

    await db.insert(settingsTable)
      .values({
        key: key,
        value: JSON.stringify(contactData),
        description: `Contact form submission from ${input.name} (${input.email})`
      })
      .execute();

    return {
      success: true,
      message: 'Thank you for your message. We will get back to you soon.'
    };
  } catch (error) {
    console.error('Contact form submission failed:', error);
    throw error;
  }
};

/**
 * Handler for getting all contact form submissions
 * This handler retrieves all contact submissions for admin review
 */
export const getContactSubmissions = async (): Promise<ContactSubmission[]> => {
  try {
    // Query all settings and filter on the client side since Drizzle doesn't support LIKE with patterns directly
    const results = await db.select()
      .from(settingsTable)
      .orderBy(desc(settingsTable.created_at))
      .execute();

    // Filter results to only include contact submissions and parse the JSON
    const contactSubmissions: ContactSubmission[] = [];
    
    for (const result of results) {
      if (result.key.startsWith('contact_')) {
        try {
          const data = JSON.parse(result.value);
          contactSubmissions.push({
            id: result.id,
            name: data.name,
            email: data.email,
            subject: data.subject,
            message: data.message,
            status: data.status || 'new',
            created_at: new Date(data.created_at)
          });
        } catch (parseError) {
          console.error('Failed to parse contact submission:', parseError);
        }
      }
    }

    return contactSubmissions;
  } catch (error) {
    console.error('Failed to get contact submissions:', error);
    throw error;
  }
};

/**
 * Handler for marking a contact submission as read
 * This handler updates the status of a contact submission
 */
export const markContactSubmissionAsRead = async (id: number): Promise<boolean> => {
  try {
    // Find the contact submission by id
    const results = await db.select()
      .from(settingsTable)
      .where(eq(settingsTable.id, id))
      .execute();

    if (results.length === 0 || !results[0].key.startsWith('contact_')) {
      return false;
    }

    const currentData = JSON.parse(results[0].value);
    const updatedData = {
      ...currentData,
      status: 'read'
    };

    // Update the status
    await db.update(settingsTable)
      .set({
        value: JSON.stringify(updatedData)
      })
      .where(eq(settingsTable.id, id))
      .execute();

    return true;
  } catch (error) {
    console.error('Failed to mark contact submission as read:', error);
    throw error;
  }
};

/**
 * Handler for replying to a contact submission
 * This handler sends a reply to a contact form submission
 */
export const replyToContactSubmission = async (id: number, replyMessage: string): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!replyMessage || replyMessage.trim().length === 0) {
      return {
        success: false,
        error: 'Reply message cannot be empty'
      };
    }

    // Find the contact submission by id
    const results = await db.select()
      .from(settingsTable)
      .where(eq(settingsTable.id, id))
      .execute();

    if (results.length === 0 || !results[0].key.startsWith('contact_')) {
      return {
        success: false,
        error: 'Contact submission not found'
      };
    }

    const currentData = JSON.parse(results[0].value);
    const updatedData = {
      ...currentData,
      status: 'replied',
      reply_message: replyMessage,
      replied_at: new Date().toISOString()
    };

    // Update the status and store reply
    await db.update(settingsTable)
      .set({
        value: JSON.stringify(updatedData)
      })
      .where(eq(settingsTable.id, id))
      .execute();

    // In a real implementation, this would send an email
    // For now, we just mark it as replied
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to reply to contact submission:', error);
    return {
      success: false,
      error: 'Failed to send reply'
    };
  }
};

/**
 * Handler for getting contact submission statistics
 * This handler returns statistics about contact submissions
 */
export const getContactSubmissionStats = async (): Promise<{
  total: number;
  new: number;
  read: number;
  replied: number;
  thisMonth: number;
}> => {
  try {
    const submissions = await getContactSubmissions();
    
    const stats = {
      total: submissions.length,
      new: 0,
      read: 0,
      replied: 0,
      thisMonth: 0
    };

    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    submissions.forEach(submission => {
      // Count by status
      if (submission.status === 'new') stats.new++;
      else if (submission.status === 'read') stats.read++;
      else if (submission.status === 'replied') stats.replied++;

      // Count this month's submissions
      if (submission.created_at >= currentMonth) {
        stats.thisMonth++;
      }
    });

    return stats;
  } catch (error) {
    console.error('Failed to get contact submission stats:', error);
    throw error;
  }
};

/**
 * Handler for deleting a contact submission
 * This handler removes a contact submission from the database
 */
export const deleteContactSubmission = async (id: number): Promise<boolean> => {
  try {
    // First verify it's a contact submission
    const results = await db.select()
      .from(settingsTable)
      .where(eq(settingsTable.id, id))
      .execute();

    if (results.length === 0 || !results[0].key.startsWith('contact_')) {
      return false;
    }

    // Delete the submission
    await db.delete(settingsTable)
      .where(eq(settingsTable.id, id))
      .execute();

    return true;
  } catch (error) {
    console.error('Failed to delete contact submission:', error);
    throw error;
  }
};

/**
 * Handler for exporting contact submissions
 * This handler exports contact submissions to CSV format
 */
export const exportContactSubmissions = async (startDate?: Date, endDate?: Date): Promise<string> => {
  try {
    let submissions = await getContactSubmissions();

    // Filter by date range if provided
    if (startDate || endDate) {
      submissions = submissions.filter(submission => {
        const submissionDate = submission.created_at;
        if (startDate && submissionDate < startDate) return false;
        if (endDate && submissionDate > endDate) return false;
        return true;
      });
    }

    // Create CSV header
    const csvHeader = 'ID,Name,Email,Subject,Status,Created At,Message\n';
    
    // Create CSV rows
    const csvRows = submissions.map(submission => {
      // Escape CSV values
      const escapeCsv = (value: string) => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      };

      return [
        submission.id,
        escapeCsv(submission.name),
        escapeCsv(submission.email),
        escapeCsv(submission.subject),
        submission.status,
        submission.created_at.toISOString(),
        escapeCsv(submission.message)
      ].join(',');
    }).join('\n');

    // Return CSV with proper line endings
    if (csvRows.length > 0) {
      return csvHeader + csvRows + '\n';
    } else {
      return csvHeader;
    }
  } catch (error) {
    console.error('Failed to export contact submissions:', error);
    throw error;
  }
};