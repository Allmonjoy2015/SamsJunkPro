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

  test('returns isValid false when ID type is not in the allowed list', () => {
    const customerDataWithInvalidIdType = { ...validCustomerData, idType: 'student_id' };
    const validationResult = validateCustomerData(customerDataWithInvalidIdType);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/id type/i);
  });

  test('returns isValid true when a valid ID type is provided', () => {
    const customerDataWithDriverLicense = { ...validCustomerData, idType: 'driver_license' };
    const validationResult = validateCustomerData(customerDataWithDriverLicense);
    expect(validationResult.isValid).toBe(true);
    expect(validationResult.errorMessage).toBeNull();
  });

  test('returns isValid false when ID expiration is not in YYYY-MM-DD format', () => {
    const customerDataWithBadExpiration = { ...validCustomerData, idExpiration: '12/31/2030' };
    const validationResult = validateCustomerData(customerDataWithBadExpiration);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/expiration/i);
  });

  test('returns isValid false when is_business is true but company name is empty', () => {
    const customerDataBusinessWithoutName = { ...validCustomerData, isBusiness: true, companyName: '' };
    const validationResult = validateCustomerData(customerDataBusinessWithoutName);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/company name/i);
  });

  test('returns isValid true for a complete business customer record', () => {
    const businessCustomerData = {
      ...validCustomerData,
      isBusiness: true,
      companyName: "Sam's Auto Parts",
      einNumber: '12-3456789',
    };
    const validationResult = validateCustomerData(businessCustomerData);
    expect(validationResult.isValid).toBe(true);
    expect(validationResult.errorMessage).toBeNull();
  });

  test('returns isValid false when EIN does not contain exactly 9 digits', () => {
    const customerDataWithShortEin = { ...validCustomerData, companyName: 'ACME', isBusiness: true, einNumber: '12-345' };
    const validationResult = validateCustomerData(customerDataWithShortEin);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/ein/i);
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
    logDate: '2026-03-22',
    cashOnHand: 250.00,
    checksReceived: 75.00,
    notes: 'Busy Saturday.',
  };

  test('returns isValid true for a complete and correct daily log entry', () => {
    const validationResult = validateDailyLogData(validDailyLogData);
    expect(validationResult.isValid).toBe(true);
    expect(validationResult.errorMessage).toBeNull();
  });

  test('returns isValid true when only the required logDate is provided', () => {
    const validationResult = validateDailyLogData({ logDate: '2026-03-22' });
    expect(validationResult.isValid).toBe(true);
    expect(validationResult.errorMessage).toBeNull();
  });

  test('returns isValid false when logDate is missing', () => {
    const validationResult = validateDailyLogData({ cashOnHand: 100 });
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/log date/i);
  });

  test('returns isValid false when logDate is not in YYYY-MM-DD format', () => {
    const validationResult = validateDailyLogData({ logDate: '03/22/2026' });
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/yyyy-mm-dd/i);
  });

  test('returns isValid false when cashOnHand is a negative number', () => {
    const logDataWithNegativeCash = { ...validDailyLogData, cashOnHand: -10 };
    const validationResult = validateDailyLogData(logDataWithNegativeCash);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/cash on hand/i);
  });

  test('returns isValid false when checksReceived is a negative number', () => {
    const logDataWithNegativeChecks = { ...validDailyLogData, checksReceived: -5 };
    const validationResult = validateDailyLogData(logDataWithNegativeChecks);
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/checks received/i);
  });

  test('returns isValid true when cashOnHand is zero', () => {
    const logDataWithZeroCash = { ...validDailyLogData, cashOnHand: 0 };
    const validationResult = validateDailyLogData(logDataWithZeroCash);
    expect(validationResult.isValid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateComplianceLogData
// ---------------------------------------------------------------------------

describe('validateComplianceLogData', () => {
  test('returns isValid true for a record with a valid log date', () => {
    const validationResult = validateComplianceLogData({ logDate: '2026-03-22' });
    expect(validationResult.isValid).toBe(true);
    expect(validationResult.errorMessage).toBeNull();
  });

  test('returns isValid false when logDate is missing', () => {
    const validationResult = validateComplianceLogData({ officerName: 'Officer Smith' });
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/log date/i);
  });

  test('returns isValid false when logDate is not in YYYY-MM-DD format', () => {
    const validationResult = validateComplianceLogData({ logDate: 'March 22, 2026' });
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errorMessage).toMatch(/yyyy-mm-dd/i);
  });
});
