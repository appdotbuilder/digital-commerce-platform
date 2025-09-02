import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { settingsTable } from '../db/schema';
import { type UpdateSettingInput } from '../schema';
import {
  getSettings,
  getSettingByKey,
  updateSetting,
  updateMultipleSettings,
  deleteSetting,
  getDefaultSettings,
  initializeDefaultSettings,
  validateSettingValue,
  getSettingsByCategory,
  backupSettings,
  restoreSettings
} from '../handlers/settings';
import { eq } from 'drizzle-orm';

// Test data
const testSetting: UpdateSettingInput = {
  key: 'test_setting',
  value: 'test_value'
};

const testSettings: UpdateSettingInput[] = [
  { key: 'setting1', value: 'value1' },
  { key: 'setting2', value: 'value2' },
  { key: 'setting3', value: 'value3' }
];

describe('Settings handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getSettings', () => {
    it('should return empty array when no settings exist', async () => {
      const settings = await getSettings();
      
      expect(settings).toEqual([]);
    });

    it('should return all settings ordered by key', async () => {
      // Create test settings
      await db.insert(settingsTable).values([
        { key: 'zebra_setting', value: 'last', description: null },
        { key: 'alpha_setting', value: 'first', description: null },
        { key: 'beta_setting', value: 'middle', description: null }
      ]);

      const settings = await getSettings();
      
      expect(settings).toHaveLength(3);
      expect(settings[0].key).toBe('alpha_setting');
      expect(settings[1].key).toBe('beta_setting');
      expect(settings[2].key).toBe('zebra_setting');
    });
  });

  describe('getSettingByKey', () => {
    it('should return null for non-existent setting', async () => {
      const setting = await getSettingByKey('non_existent');
      
      expect(setting).toBeNull();
    });

    it('should return setting for existing key', async () => {
      // Create test setting
      const created = await db.insert(settingsTable)
        .values({
          key: 'test_key',
          value: 'test_value',
          description: 'Test description'
        })
        .returning()
        .execute();

      const setting = await getSettingByKey('test_key');
      
      expect(setting).not.toBeNull();
      expect(setting?.key).toBe('test_key');
      expect(setting?.value).toBe('test_value');
      expect(setting?.description).toBe('Test description');
      expect(setting?.id).toBe(created[0].id);
    });
  });

  describe('updateSetting', () => {
    it('should create new setting when it does not exist', async () => {
      const result = await updateSetting(testSetting);

      expect(result.key).toBe('test_setting');
      expect(result.value).toBe('test_value');
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);

      // Verify in database
      const saved = await db.select()
        .from(settingsTable)
        .where(eq(settingsTable.key, 'test_setting'))
        .execute();

      expect(saved).toHaveLength(1);
      expect(saved[0].value).toBe('test_value');
    });

    it('should update existing setting', async () => {
      // Create initial setting
      await updateSetting(testSetting);

      // Update the setting
      const updatedSetting = await updateSetting({
        key: 'test_setting',
        value: 'updated_value'
      });

      expect(updatedSetting.key).toBe('test_setting');
      expect(updatedSetting.value).toBe('updated_value');

      // Verify only one record exists
      const settings = await db.select()
        .from(settingsTable)
        .where(eq(settingsTable.key, 'test_setting'))
        .execute();

      expect(settings).toHaveLength(1);
      expect(settings[0].value).toBe('updated_value');
    });
  });

  describe('updateMultipleSettings', () => {
    it('should create multiple new settings', async () => {
      const results = await updateMultipleSettings(testSettings);

      expect(results).toHaveLength(3);
      expect(results[0].key).toBe('setting1');
      expect(results[1].key).toBe('setting2');
      expect(results[2].key).toBe('setting3');

      // Verify all settings were created
      const allSettings = await getSettings();
      expect(allSettings).toHaveLength(3);
    });

    it('should update existing and create new settings', async () => {
      // Create one existing setting
      await updateSetting({ key: 'setting1', value: 'old_value' });

      const results = await updateMultipleSettings(testSettings);

      expect(results).toHaveLength(3);
      expect(results[0].value).toBe('value1'); // Updated existing
      expect(results[1].value).toBe('value2'); // New
      expect(results[2].value).toBe('value3'); // New

      const allSettings = await getSettings();
      expect(allSettings).toHaveLength(3);
    });
  });

  describe('deleteSetting', () => {
    it('should return false for non-existent setting', async () => {
      const result = await deleteSetting('non_existent');
      
      expect(result).toBe(false);
    });

    it('should delete existing setting', async () => {
      // Create test setting
      await updateSetting(testSetting);

      const result = await deleteSetting('test_setting');
      
      expect(result).toBe(true);

      // Verify setting was deleted
      const setting = await getSettingByKey('test_setting');
      expect(setting).toBeNull();
    });

    it('should prevent deletion of critical settings', async () => {
      // Create critical setting
      await updateSetting({ key: 'admin_email', value: 'admin@test.com' });

      const result = await deleteSetting('admin_email');
      
      expect(result).toBe(false);

      // Verify setting still exists
      const setting = await getSettingByKey('admin_email');
      expect(setting).not.toBeNull();
    });
  });

  describe('getDefaultSettings', () => {
    it('should return array of default settings', async () => {
      const defaults = await getDefaultSettings();

      expect(Array.isArray(defaults)).toBe(true);
      expect(defaults.length).toBeGreaterThan(0);
      
      // Check some key default settings
      const siteNameSetting = defaults.find(s => s.key === 'site_name');
      expect(siteNameSetting).toBeDefined();
      expect(siteNameSetting?.value).toBe('Digital Store');

      const currencySetting = defaults.find(s => s.key === 'currency');
      expect(currencySetting).toBeDefined();
      expect(currencySetting?.value).toBe('USD');
    });
  });

  describe('initializeDefaultSettings', () => {
    it('should create default settings when none exist', async () => {
      await initializeDefaultSettings();

      const settings = await getSettings();
      expect(settings.length).toBeGreaterThan(0);

      // Check specific default settings
      const siteName = await getSettingByKey('site_name');
      expect(siteName?.value).toBe('Digital Store');

      const currency = await getSettingByKey('currency');
      expect(currency?.value).toBe('USD');
    });

    it('should not overwrite existing settings', async () => {
      // Create custom setting
      await updateSetting({ key: 'site_name', value: 'My Custom Store' });

      await initializeDefaultSettings();

      // Verify custom value is preserved
      const siteName = await getSettingByKey('site_name');
      expect(siteName?.value).toBe('My Custom Store');

      // Verify other defaults were created
      const currency = await getSettingByKey('currency');
      expect(currency?.value).toBe('USD');
    });
  });

  describe('validateSettingValue', () => {
    it('should validate email addresses', async () => {
      const validResult = await validateSettingValue('admin_email', 'test@example.com');
      expect(validResult.isValid).toBe(true);
      expect(validResult.error).toBeUndefined();

      const invalidResult = await validateSettingValue('admin_email', 'invalid-email');
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.error).toBeDefined();
    });

    it('should validate tax rate', async () => {
      const validResult = await validateSettingValue('tax_rate', '15.5');
      expect(validResult.isValid).toBe(true);

      const invalidResult = await validateSettingValue('tax_rate', '150');
      expect(invalidResult.isValid).toBe(false);
    });

    it('should validate boolean settings', async () => {
      const validTrue = await validateSettingValue('maintenance_mode', 'true');
      expect(validTrue.isValid).toBe(true);

      const validFalse = await validateSettingValue('maintenance_mode', 'false');
      expect(validFalse.isValid).toBe(true);

      const invalid = await validateSettingValue('maintenance_mode', 'maybe');
      expect(invalid.isValid).toBe(false);
    });

    it('should accept any value for unknown settings', async () => {
      const result = await validateSettingValue('unknown_setting', 'any_value');
      expect(result.isValid).toBe(true);
    });
  });

  describe('getSettingsByCategory', () => {
    it('should categorize settings correctly', async () => {
      // Create test settings from different categories
      await updateMultipleSettings([
        { key: 'site_name', value: 'Test Site' },
        { key: 'smtp_host', value: 'smtp.example.com' },
        { key: 'admin_email', value: 'admin@test.com' },
        { key: 'stripe_public_key', value: 'pk_test_123' },
        { key: 'enable_user_registration', value: 'true' },
        { key: 'max_download_attempts', value: '5' }
      ]);

      const categorized = await getSettingsByCategory();

      expect(categorized.general.length).toBeGreaterThan(0);
      expect(categorized.email.length).toBeGreaterThan(0);
      expect(categorized.payment.length).toBeGreaterThan(0);
      expect(categorized.security.length).toBeGreaterThan(0);
      expect(categorized.downloads.length).toBeGreaterThan(0);

      // Check specific categorization
      const emailSettings = categorized.email;
      expect(emailSettings.some(s => s.key === 'smtp_host')).toBe(true);
      expect(emailSettings.some(s => s.key === 'admin_email')).toBe(true);

      const paymentSettings = categorized.payment;
      expect(paymentSettings.some(s => s.key === 'stripe_public_key')).toBe(true);
    });

    it('should return empty categories when no settings exist', async () => {
      const categorized = await getSettingsByCategory();

      expect(categorized.general).toEqual([]);
      expect(categorized.email).toEqual([]);
      expect(categorized.payment).toEqual([]);
      expect(categorized.security).toEqual([]);
      expect(categorized.downloads).toEqual([]);
    });
  });

  describe('backupSettings', () => {
    it('should return empty JSON for no settings', async () => {
      const backup = await backupSettings();
      
      expect(backup).toBe('[]');
    });

    it('should backup all settings as JSON', async () => {
      // Create test settings
      await updateMultipleSettings([
        { key: 'setting1', value: 'value1' },
        { key: 'setting2', value: 'value2' }
      ]);

      const backup = await backupSettings();
      const parsedBackup = JSON.parse(backup);

      expect(Array.isArray(parsedBackup)).toBe(true);
      expect(parsedBackup).toHaveLength(2);
      expect(parsedBackup[0]).toHaveProperty('key');
      expect(parsedBackup[0]).toHaveProperty('value');
      expect(parsedBackup[0]).toHaveProperty('description');
    });
  });

  describe('restoreSettings', () => {
    it('should restore settings from valid backup', async () => {
      const backupData = JSON.stringify([
        { key: 'restored_setting1', value: 'restored_value1', description: null },
        { key: 'restored_setting2', value: 'restored_value2', description: 'Test' }
      ]);

      const result = await restoreSettings(backupData);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify settings were restored
      const setting1 = await getSettingByKey('restored_setting1');
      expect(setting1?.value).toBe('restored_value1');

      const setting2 = await getSettingByKey('restored_setting2');
      expect(setting2?.value).toBe('restored_value2');
    });

    it('should handle invalid JSON', async () => {
      const result = await restoreSettings('invalid json');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid backup data format');
    });

    it('should handle non-array backup data', async () => {
      const result = await restoreSettings('{"not": "array"}');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Backup data must be an array');
    });

    it('should skip invalid entries', async () => {
      const backupData = JSON.stringify([
        { key: 'valid_setting', value: 'valid_value' },
        { key: '', value: 'invalid_empty_key' },
        { key: 'missing_value' },
        { key: 'another_valid', value: 'another_value' }
      ]);

      const result = await restoreSettings(backupData);

      expect(result.success).toBe(true);

      // Only valid settings should be restored
      const validSetting = await getSettingByKey('valid_setting');
      expect(validSetting?.value).toBe('valid_value');

      const anotherValid = await getSettingByKey('another_valid');
      expect(anotherValid?.value).toBe('another_value');

      const invalidSetting = await getSettingByKey('');
      expect(invalidSetting).toBeNull();
    });
  });
});