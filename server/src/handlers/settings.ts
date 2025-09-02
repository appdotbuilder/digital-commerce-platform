import { db } from '../db';
import { settingsTable } from '../db/schema';
import { type UpdateSettingInput, type Setting } from '../schema';
import { eq, asc } from 'drizzle-orm';

/**
 * Handler for getting all system settings
 * This handler retrieves all configuration settings
 */
export async function getSettings(): Promise<Setting[]> {
  try {
    const results = await db.select()
      .from(settingsTable)
      .orderBy(asc(settingsTable.key))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to get settings:', error);
    throw error;
  }
}

/**
 * Handler for getting a specific setting by key
 * This handler retrieves a single setting value
 */
export async function getSettingByKey(key: string): Promise<Setting | null> {
  try {
    const results = await db.select()
      .from(settingsTable)
      .where(eq(settingsTable.key, key))
      .limit(1)
      .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Failed to get setting by key:', error);
    throw error;
  }
}

/**
 * Handler for updating or creating a setting
 * This handler updates existing setting or creates new one
 */
export async function updateSetting(input: UpdateSettingInput): Promise<Setting> {
  try {
    // First, try to find existing setting
    const existing = await getSettingByKey(input.key);

    if (existing) {
      // Update existing setting
      const results = await db.update(settingsTable)
        .set({
          value: input.value,
          updated_at: new Date()
        })
        .where(eq(settingsTable.key, input.key))
        .returning()
        .execute();

      return results[0];
    } else {
      // Create new setting
      const results = await db.insert(settingsTable)
        .values({
          key: input.key,
          value: input.value,
          description: null
        })
        .returning()
        .execute();

      return results[0];
    }
  } catch (error) {
    console.error('Failed to update setting:', error);
    throw error;
  }
}

/**
 * Handler for updating multiple settings at once
 * This handler batch updates multiple settings
 */
export async function updateMultipleSettings(settings: UpdateSettingInput[]): Promise<Setting[]> {
  try {
    const results: Setting[] = [];
    
    // Process each setting (could be optimized with batch operations)
    for (const settingInput of settings) {
      const updatedSetting = await updateSetting(settingInput);
      results.push(updatedSetting);
    }

    return results;
  } catch (error) {
    console.error('Failed to update multiple settings:', error);
    throw error;
  }
}

/**
 * Handler for deleting a setting
 * This handler removes a setting from the database
 */
export async function deleteSetting(key: string): Promise<boolean> {
  try {
    // Define critical settings that cannot be deleted
    const criticalSettings = [
      'admin_email',
      'site_name',
      'currency'
    ];

    if (criticalSettings.includes(key)) {
      return false; // Cannot delete critical settings
    }

    const results = await db.delete(settingsTable)
      .where(eq(settingsTable.key, key))
      .returning()
      .execute();

    return results.length > 0;
  } catch (error) {
    console.error('Failed to delete setting:', error);
    throw error;
  }
}

/**
 * Handler for getting default system settings
 * This handler returns default settings for system initialization
 */
export async function getDefaultSettings(): Promise<UpdateSettingInput[]> {
  return [
    { key: 'site_name', value: 'Digital Store' },
    { key: 'site_description', value: 'Your digital products marketplace' },
    { key: 'admin_email', value: 'admin@example.com' },
    { key: 'currency', value: 'USD' },
    { key: 'tax_rate', value: '10' },
    { key: 'smtp_host', value: '' },
    { key: 'smtp_port', value: '587' },
    { key: 'smtp_username', value: '' },
    { key: 'smtp_password', value: '' },
    { key: 'payment_gateway', value: 'stripe' },
    { key: 'stripe_public_key', value: '' },
    { key: 'stripe_secret_key', value: '' },
    { key: 'max_download_attempts', value: '5' },
    { key: 'download_link_expiry_hours', value: '24' },
    { key: 'enable_user_registration', value: 'true' },
    { key: 'require_email_verification', value: 'true' },
    { key: 'maintenance_mode', value: 'false' }
  ];
}

/**
 * Handler for initializing default settings
 * This handler creates default settings if they don't exist
 */
export async function initializeDefaultSettings(): Promise<void> {
  try {
    const defaultSettings = await getDefaultSettings();
    
    for (const setting of defaultSettings) {
      const existing = await getSettingByKey(setting.key);
      if (!existing) {
        await updateSetting(setting);
      }
    }
  } catch (error) {
    console.error('Failed to initialize default settings:', error);
    throw error;
  }
}

/**
 * Handler for validating setting values
 * This handler validates setting values based on key type
 */
export async function validateSettingValue(key: string, value: string): Promise<{ isValid: boolean; error?: string }> {
  const validationRules: { [key: string]: (value: string) => boolean } = {
    admin_email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    tax_rate: (v) => !isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100,
    smtp_port: (v) => !isNaN(Number(v)) && Number(v) > 0 && Number(v) <= 65535,
    max_download_attempts: (v) => !isNaN(Number(v)) && Number(v) > 0,
    download_link_expiry_hours: (v) => !isNaN(Number(v)) && Number(v) > 0,
    enable_user_registration: (v) => v === 'true' || v === 'false',
    require_email_verification: (v) => v === 'true' || v === 'false',
    maintenance_mode: (v) => v === 'true' || v === 'false'
  };

  if (validationRules[key]) {
    const isValid = validationRules[key](value);
    return {
      isValid,
      error: isValid ? undefined : `Invalid value for ${key}`
    };
  }

  return { isValid: true };
}

/**
 * Handler for getting settings by category
 * This handler groups settings by category for admin UI
 */
export async function getSettingsByCategory(): Promise<{
  general: Setting[];
  email: Setting[];
  payment: Setting[];
  security: Setting[];
  downloads: Setting[];
}> {
  try {
    const allSettings = await getSettings();
    
    const categorizedSettings = {
      general: [] as Setting[],
      email: [] as Setting[],
      payment: [] as Setting[],
      security: [] as Setting[],
      downloads: [] as Setting[]
    };

    allSettings.forEach(setting => {
      const key = setting.key;
      
      if (key.startsWith('smtp_') || key.includes('email')) {
        categorizedSettings.email.push(setting);
      } else if (key.startsWith('stripe_') || key.includes('payment') || key === 'payment_gateway') {
        categorizedSettings.payment.push(setting);
      } else if (key.includes('registration') || key.includes('verification') || key === 'maintenance_mode') {
        categorizedSettings.security.push(setting);
      } else if (key.includes('download')) {
        categorizedSettings.downloads.push(setting);
      } else {
        categorizedSettings.general.push(setting);
      }
    });

    return categorizedSettings;
  } catch (error) {
    console.error('Failed to get settings by category:', error);
    throw error;
  }
}

/**
 * Handler for backing up settings
 * This handler exports all settings for backup purposes
 */
export async function backupSettings(): Promise<string> {
  try {
    const settings = await getSettings();
    const backupData = settings.map(setting => ({
      key: setting.key,
      value: setting.value,
      description: setting.description
    }));
    
    return JSON.stringify(backupData, null, 2);
  } catch (error) {
    console.error('Failed to backup settings:', error);
    throw error;
  }
}

/**
 * Handler for restoring settings from backup
 * This handler imports settings from backup data
 */
export async function restoreSettings(backupData: string): Promise<{ success: boolean; error?: string }> {
  try {
    let parsedData: Array<{ key: string; value: string; description?: string | null }>;
    
    try {
      parsedData = JSON.parse(backupData);
    } catch (parseError) {
      return {
        success: false,
        error: 'Invalid backup data format'
      };
    }

    if (!Array.isArray(parsedData)) {
      return {
        success: false,
        error: 'Backup data must be an array'
      };
    }

    // Validate and restore settings
    for (const settingData of parsedData) {
      if (!settingData.key || !settingData.value) {
        continue; // Skip invalid entries
      }

      await updateSetting({
        key: settingData.key,
        value: settingData.value
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to restore settings:', error);
    return {
      success: false,
      error: 'Failed to restore settings from backup'
    };
  }
}