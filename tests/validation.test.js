/**
 * validation.test.js
 *
 * Unit tests for the shared validation helpers.
 * These tests also serve as working examples of the descriptive naming conventions
 * used throughout SamsJunkPro.
 *
 * Run with: npm test
 */

'use strict';

const {
  validateSalvagePartData,
  validateCustomerData,
  validateSaleLineItems,
  validateDailyLogData,
  validateComplianceLogData,
} = require('../src/shared/validation');

// ---------------------------------------------------------------------------
// validateSalvagePartData
// ---------------------------------------------------------------------------

describe('validateSalvagePartData', () => {
  /** A valid part data object reused across tests. */
  const validSalvagePartData = {
    partName: 'Driver Side Door',
    vehicleMake: 'Ford',
    vehicleModel: 'F-150',
    vehicleYear: 2015,
    partCondition: 'Good',
    askingPriceDollars: 75.00,
  };

  test('returns isValid true for a complete and correct salvage part', () => {
    const validationResult = validateSalvagePartData(validSalvagePartData);
    expect(validationResult.isValid).toBe(true);
    expect(validationResult.errorMessage).toBeNull();
  });

  test('returns isValid false when part name is an empty string', () => {
    const partDataMissingName = { ...validSalvagePartData, partName: '' };
    const validationResult = validateSalvagePartData(partDataMissingName);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/part name/i);
  });

  test('returns isValid false when vehicle make is missing', () => {
    const partDataMissingMake = { ...validSalvagePartData, vehicleMake: '' };
    const validationResult = validateSalvagePartData(partDataMissingMake);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/vehicle make/i);
  });

  test('returns isValid false when vehicle year is below 1885', () => {
    const partDataWithInvalidYear = { ...validSalvagePartData, vehicleYear: 1800 };
    const validationResult = validateSalvagePartData(partDataWithInvalidYear);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/vehicle year/i);
  });

  test('returns isValid false when vehicle year is a future year beyond next year', () => {
    const farFutureVehicleYear = new Date().getFullYear() + 5;
    const partDataWithFutureYear = { ...validSalvagePartData, vehicleYear: farFutureVehicleYear };
    const validationResult = validateSalvagePartData(partDataWithFutureYear);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/vehicle year/i);
  });

  test('returns isValid false when part condition is not in the allowed list', () => {
    const partDataWithUnknownCondition = { ...validSalvagePartData, partCondition: 'Like New' };
    const validationResult = validateSalvagePartData(partDataWithUnknownCondition);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/condition/i);
  });

  test('returns isValid false when asking price is a negative number', () => {
    const partDataWithNegativePrice = { ...validSalvagePartData, askingPriceDollars: -10 };
    const validationResult = validateSalvagePartData(partDataWithNegativePrice);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/asking price/i);
  });

  test('returns isValid true when asking price is zero (free part)', () => {
    const partDataWithZeroPrice = { ...validSalvagePartData, askingPriceDollars: 0 };
    const validationResult = validateSalvagePartData(partDataWithZeroPrice);
    expect(validationResult.isValid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateCustomerData
// ---------------------------------------------------------------------------

describe('validateCustomerData', () => {
  /** A valid customer data object reused across tests. */
  const validCustomerData = {
    customerFirstName: 'Jane',
    customerLastName: 'Smith',
    customerPhoneNumber: '555-867-5309',
    customerEmailAddress: 'jane.smith@example.com',
  };

  test('returns isValid true for a complete and correct customer record', () => {
    const validationResult = validateCustomerData(validCustomerData);
    expect(validationResult.isValid).toBe(true);
    expect(validationResult.errorMessage).toBeNull();
  });

  test('returns isValid true when optional phone and email are omitted', () => {
    const customerDataWithoutContactDetails = {
      customerFirstName: 'John',
      customerLastName: 'Doe',
    };
    const validationResult = validateCustomerData(customerDataWithoutContactDetails);
    expect(validationResult.isValid).toBe(true);
  });

  test('returns isValid false when first name is empty', () => {
    const customerDataMissingFirstName = { ...validCustomerData, customerFirstName: '' };
    const validationResult = validateCustomerData(customerDataMissingFirstName);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/first name/i);
  });

  test('returns isValid false when last name is empty', () => {
    const customerDataMissingLastName = { ...validCustomerData, customerLastName: '' };
    const validationResult = validateCustomerData(customerDataMissingLastName);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/last name/i);
  });

  test('returns isValid false when phone number has fewer than 10 digits', () => {
    const customerDataWithShortPhoneNumber = { ...validCustomerData, customerPhoneNumber: '123-456' };
    const validationResult = validateCustomerData(customerDataWithShortPhoneNumber);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/phone number/i);
  });

  test('returns isValid false when email address format is invalid', () => {
    const customerDataWithMalformedEmail = { ...validCustomerData, customerEmailAddress: 'not-an-email' };
    const validationResult = validateCustomerData(customerDataWithMalformedEmail);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/email/i);
  });

  test('returns isValid false when id expiration date is not in YYYY-MM-DD format', () => {
    const customerDataWithBadIdExpiration = { ...validCustomerData, idExpiration: '12/31/2030' };
    const validationResult = validateCustomerData(customerDataWithBadIdExpiration);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/expiration date/i);
  });

  test('returns isValid true when id expiration date is a valid YYYY-MM-DD string', () => {
    const customerDataWithValidIdExpiration = { ...validCustomerData, idExpiration: '2030-12-31' };
    const validationResult = validateCustomerData(customerDataWithValidIdExpiration);
    expect(validationResult.isValid).toBe(true);
  });

  test('returns isValid false when isBusiness is true but company name is empty', () => {
    const businessCustomerMissingCompanyName = {
      ...validCustomerData,
      isBusiness: true,
      companyName: '',
    };
    const validationResult = validateCustomerData(businessCustomerMissingCompanyName);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/company name/i);
  });

  test('returns isValid true for a business customer with a company name', () => {
    const validBusinessCustomerData = {
      ...validCustomerData,
      isBusiness: true,
      companyName: 'Acme Salvage LLC',
      einNumber: '12-3456789',
    };
    const validationResult = validateCustomerData(validBusinessCustomerData);
    expect(validationResult.isValid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateSaleLineItems
// ---------------------------------------------------------------------------

describe('validateSaleLineItems', () => {
  /** A valid list of sale line items reused across tests. */
  const validSaleLineItemList = [
    { salvagePartId: 1, quantitySold: 1, agreedUnitPriceDollars: 50.00 },
    { salvagePartId: 2, quantitySold: 2, agreedUnitPriceDollars: 25.00 },
  ];

  test('returns isValid true for a well-formed list of sale line items', () => {
    const validationResult = validateSaleLineItems(validSaleLineItemList);
    expect(validationResult.isValid).toBe(true);
    expect(validationResult.errorMessage).toBeNull();
  });

  test('returns isValid false when the line item list is empty', () => {
    const validationResult = validateSaleLineItems([]);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/at least one/i);
  });

  test('returns isValid false when a line item has an invalid salvage part ID', () => {
    const lineItemsWithInvalidPartId = [
      { salvagePartId: -1, quantitySold: 1, agreedUnitPriceDollars: 30.00 },
    ];
    const validationResult = validateSaleLineItems(lineItemsWithInvalidPartId);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/part id/i);
  });

  test('returns isValid false when quantity sold is zero', () => {
    const lineItemsWithZeroQuantity = [
      { salvagePartId: 1, quantitySold: 0, agreedUnitPriceDollars: 30.00 },
    ];
    const validationResult = validateSaleLineItems(lineItemsWithZeroQuantity);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/quantity/i);
  });

  test('returns isValid false when agreed unit price is negative', () => {
    const lineItemsWithNegativePrice = [
      { salvagePartId: 1, quantitySold: 1, agreedUnitPriceDollars: -5.00 },
    ];
    const validationResult = validateSaleLineItems(lineItemsWithNegativePrice);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/unit price/i);
  });

  test('returns isValid true when agreed unit price is zero (donated part)', () => {
    const lineItemsWithZeroPrice = [
      { salvagePartId: 1, quantitySold: 1, agreedUnitPriceDollars: 0 },
    ];
    const validationResult = validateSaleLineItems(lineItemsWithZeroPrice);
    expect(validationResult.isValid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateDailyLogData
// ---------------------------------------------------------------------------

describe('validateDailyLogData', () => {
  /** A valid daily log data object reused across tests. */
  const validDailyLogData = {
    logDate: '2025-07-04',
    cashOnHand: 350.00,
    checksReceived: 125.00,
  };

  test('returns isValid true for a complete and correct daily log', () => {
    const validationResult = validateDailyLogData(validDailyLogData);
    expect(validationResult.isValid).toBe(true);
    expect(validationResult.errorMessage).toBeNull();
  });

  test('returns isValid true when optional financial fields are omitted', () => {
    const validationResult = validateDailyLogData({ logDate: '2025-07-04' });
    expect(validationResult.isValid).toBe(true);
  });

  test('returns isValid false when log date is missing', () => {
    const dailyLogDataMissingDate = { cashOnHand: 100 };
    const validationResult = validateDailyLogData(dailyLogDataMissingDate);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/log date/i);
  });

  test('returns isValid false when log date is not in YYYY-MM-DD format', () => {
    const dailyLogDataWithBadDate = { ...validDailyLogData, logDate: '07/04/2025' };
    const validationResult = validateDailyLogData(dailyLogDataWithBadDate);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/YYYY-MM-DD/);
  });

  test('returns isValid false when cash on hand is a negative number', () => {
    const dailyLogDataWithNegativeCash = { ...validDailyLogData, cashOnHand: -50 };
    const validationResult = validateDailyLogData(dailyLogDataWithNegativeCash);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/cash on hand/i);
  });

  test('returns isValid false when checks received is a negative number', () => {
    const dailyLogDataWithNegativeChecks = { ...validDailyLogData, checksReceived: -10 };
    const validationResult = validateDailyLogData(dailyLogDataWithNegativeChecks);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/checks received/i);
  });

  test('returns isValid true when cash on hand is zero', () => {
    const dailyLogDataWithZeroCash = { ...validDailyLogData, cashOnHand: 0 };
    const validationResult = validateDailyLogData(dailyLogDataWithZeroCash);
    expect(validationResult.isValid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateComplianceLogData
// ---------------------------------------------------------------------------

describe('validateComplianceLogData', () => {
  test('returns isValid true for a valid compliance log entry', () => {
    const validationResult = validateComplianceLogData({ logDate: '2025-08-15' });
    expect(validationResult.isValid).toBe(true);
    expect(validationResult.errorMessage).toBeNull();
  });

  test('returns isValid false when log date is missing', () => {
    const validationResult = validateComplianceLogData({});
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/log date/i);
  });

  test('returns isValid false when log date is not in YYYY-MM-DD format', () => {
    const validationResult = validateComplianceLogData({ logDate: 'August 15 2025' });
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/YYYY-MM-DD/);
  });
});
