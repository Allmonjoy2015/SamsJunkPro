/**
 * validation.js
 *
 * Pure validation helpers shared between the main and renderer processes.
 * Each function returns `{ isValid: boolean, errorMessage: string | null }`.
 */

'use strict';

const { PART_CONDITION_OPTIONS, CUSTOMER_ID_TYPE_OPTIONS } = require('./constants');

/**
 * Validates the data required to create or update a salvage part record.
 *
 * @param {Object} salvagePartData - The part fields submitted by the user.
 * @param {string} salvagePartData.partName        - Human-readable name of the part.
 * @param {string} salvagePartData.vehicleMake     - Manufacturer of the donor vehicle (e.g. "Ford").
 * @param {string} salvagePartData.vehicleModel    - Model of the donor vehicle (e.g. "F-150").
 * @param {number} salvagePartData.vehicleYear     - Model year of the donor vehicle.
 * @param {string} salvagePartData.partCondition   - One of PART_CONDITION_OPTIONS.
 * @param {number} salvagePartData.askingPriceDollars - Listed price in US dollars.
 * @returns {{ isValid: boolean, errorMessage: string | null }}
 */
function validateSalvagePartData(salvagePartData) {
  const { partName, vehicleMake, vehicleModel, vehicleYear, partCondition, askingPriceDollars } =
    salvagePartData;

  if (!partName || partName.trim().length === 0) {
    return { isValid: false, errorMessage: 'Part name is required.' };
  }

  if (!vehicleMake || vehicleMake.trim().length === 0) {
    return { isValid: false, errorMessage: 'Vehicle make is required.' };
  }

  if (!vehicleModel || vehicleModel.trim().length === 0) {
    return { isValid: false, errorMessage: 'Vehicle model is required.' };
  }

  const currentYear = new Date().getFullYear();
  if (
    !Number.isInteger(vehicleYear) ||
    vehicleYear < 1885 ||
    vehicleYear > currentYear + 1
  ) {
    return {
      isValid: false,
      errorMessage: `Vehicle year must be a whole number between 1885 and ${currentYear + 1}.`,
    };
  }

  if (!PART_CONDITION_OPTIONS.includes(partCondition)) {
    return {
      isValid: false,
      errorMessage: `Part condition must be one of: ${PART_CONDITION_OPTIONS.join(', ')}.`,
    };
  }

  if (typeof askingPriceDollars !== 'number' || askingPriceDollars < 0) {
    return { isValid: false, errorMessage: 'Asking price must be a non-negative number.' };
  }

  return { isValid: true, errorMessage: null };
}

/**
 * Validates the data required to create or update a customer record.
 *
 * Required fields: customerFirstName, customerLastName.
 * Optional contact fields: customerPhoneNumber, customerEmailAddress, customerAddress.
 * Optional ID-verification fields: idType, idNumber, idExpiration, idIssuedBy.
 * Optional business fields: companyName, einNumber, isBusiness.
 * Optional: notes.
 *
 * @param {Object}  customerData
 * @param {string}  customerData.customerFirstName
 * @param {string}  customerData.customerLastName
 * @param {string}  [customerData.customerPhoneNumber]
 * @param {string}  [customerData.customerEmailAddress]
 * @param {string}  [customerData.customerAddress]
 * @param {string}  [customerData.idType]          - One of CUSTOMER_ID_TYPE_OPTIONS.
 * @param {string}  [customerData.idNumber]
 * @param {string}  [customerData.idExpiration]    - ISO date string (YYYY-MM-DD).
 * @param {string}  [customerData.idIssuedBy]
 * @param {string}  [customerData.companyName]
 * @param {string}  [customerData.einNumber]
 * @param {boolean} [customerData.isBusiness]
 * @param {string}  [customerData.notes]
 * @returns {{ isValid: boolean, errorMessage: string | null }}
 */
function validateCustomerData(customerData) {
  const {
    customerFirstName,
    customerLastName,
    customerPhoneNumber,
    customerEmailAddress,
    idType,
    idExpiration,
    isBusiness,
    companyName,
    einNumber,
  } = customerData;

  if (!customerFirstName || customerFirstName.trim().length === 0) {
    return { isValid: false, errorMessage: 'Customer first name is required.' };
  }

  if (!customerLastName || customerLastName.trim().length === 0) {
    return { isValid: false, errorMessage: 'Customer last name is required.' };
  }

  if (customerPhoneNumber) {
    const digitsOnlyPhoneNumber = customerPhoneNumber.replace(/\D/g, '');
    if (digitsOnlyPhoneNumber.length < 10) {
      return {
        isValid: false,
        errorMessage: 'Phone number must contain at least 10 digits.',
      };
    }
  }

  if (customerEmailAddress) {
    const emailFormatRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailFormatRegex.test(customerEmailAddress)) {
      return { isValid: false, errorMessage: 'Email address format is invalid.' };
    }
  }

  if (idType && !CUSTOMER_ID_TYPE_OPTIONS.includes(idType)) {
    return {
      isValid: false,
      errorMessage: `ID type must be one of: ${CUSTOMER_ID_TYPE_OPTIONS.join(', ')}.`,
    };
  }

  if (idExpiration) {
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoDateRegex.test(idExpiration)) {
      return { isValid: false, errorMessage: 'ID expiration must be in YYYY-MM-DD format.' };
    }
  }

  if (isBusiness) {
    if (!companyName || companyName.trim().length === 0) {
      return { isValid: false, errorMessage: 'Company name is required for business customers.' };
    }
  }

  if (einNumber) {
    // EIN format: XX-XXXXXXX (9 digits, optionally formatted with a dash)
    const einDigitsOnly = einNumber.replace(/\D/g, '');
    if (einDigitsOnly.length !== 9) {
      return { isValid: false, errorMessage: 'EIN must contain exactly 9 digits.' };
    }
  }

  return { isValid: true, errorMessage: null };
}

/**
 * Validates the line items that make up a sale transaction.
 *
 * @param {Array<{ salvagePartId: number, quantitySold: number, agreedUnitPriceDollars: number }>} saleLineItemList
 * @returns {{ isValid: boolean, errorMessage: string | null }}
 */
function validateSaleLineItems(saleLineItemList) {
  if (!Array.isArray(saleLineItemList) || saleLineItemList.length === 0) {
    return { isValid: false, errorMessage: 'A sale must contain at least one line item.' };
  }

  for (let lineItemIndex = 0; lineItemIndex < saleLineItemList.length; lineItemIndex++) {
    const saleLineItem = saleLineItemList[lineItemIndex];

    if (!Number.isInteger(saleLineItem.salvagePartId) || saleLineItem.salvagePartId <= 0) {
      return {
        isValid: false,
        errorMessage: `Line item ${lineItemIndex + 1}: invalid salvage part ID.`,
      };
    }

    if (!Number.isInteger(saleLineItem.quantitySold) || saleLineItem.quantitySold <= 0) {
      return {
        isValid: false,
        errorMessage: `Line item ${lineItemIndex + 1}: quantity sold must be a positive integer.`,
      };
    }

    if (
      typeof saleLineItem.agreedUnitPriceDollars !== 'number' ||
      saleLineItem.agreedUnitPriceDollars < 0
    ) {
      return {
        isValid: false,
        errorMessage: `Line item ${lineItemIndex + 1}: unit price must be a non-negative number.`,
      };
    }
  }

  return { isValid: true, errorMessage: null };
}

/**
 * Validates the data required to create a daily operating log entry.
 *
 * @param {Object} dailyLogData
 * @param {string} dailyLogData.logDate         - ISO date (YYYY-MM-DD).
 * @param {number} [dailyLogData.cashOnHand]    - Non-negative dollar amount.
 * @param {number} [dailyLogData.checksReceived] - Non-negative dollar amount.
 * @returns {{ isValid: boolean, errorMessage: string | null }}
 */
function validateDailyLogData(dailyLogData) {
  const { logDate, cashOnHand, checksReceived } = dailyLogData;

  if (!logDate || logDate.trim().length === 0) {
    return { isValid: false, errorMessage: 'Log date is required.' };
  }

  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDateRegex.test(logDate)) {
    return { isValid: false, errorMessage: 'Log date must be in YYYY-MM-DD format.' };
  }

  if (cashOnHand !== undefined && cashOnHand !== null) {
    if (typeof cashOnHand !== 'number' || cashOnHand < 0) {
      return { isValid: false, errorMessage: 'Cash on hand must be a non-negative number.' };
    }
  }

  if (checksReceived !== undefined && checksReceived !== null) {
    if (typeof checksReceived !== 'number' || checksReceived < 0) {
      return { isValid: false, errorMessage: 'Checks received must be a non-negative number.' };
    }
  }

  return { isValid: true, errorMessage: null };
}

/**
 * Validates the data required to create a compliance (law-enforcement) log entry.
 *
 * @param {Object} complianceLogData
 * @param {string} complianceLogData.logDate - ISO date (YYYY-MM-DD).
 * @returns {{ isValid: boolean, errorMessage: string | null }}
 */
function validateComplianceLogData(complianceLogData) {
  const { logDate } = complianceLogData;

  if (!logDate || logDate.trim().length === 0) {
    return { isValid: false, errorMessage: 'Log date is required.' };
  }

  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDateRegex.test(logDate)) {
    return { isValid: false, errorMessage: 'Log date must be in YYYY-MM-DD format.' };
  }

  return { isValid: true, errorMessage: null };
}

module.exports = {
  validateSalvagePartData,
  validateCustomerData,
  validateSaleLineItems,
  validateDailyLogData,
  validateComplianceLogData,
};
