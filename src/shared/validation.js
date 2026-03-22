/**
 * validation.js
 *
 * Pure validation helpers shared between the main and renderer processes.
 * Each function returns `{ isValid: boolean, errorMessage: string | null }`.
 */

'use strict';

const { PART_CONDITION_OPTIONS } = require('./constants');

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
 * @param {Object} customerData
 * @param {string} customerData.customerFirstName
 * @param {string} customerData.customerLastName
 * @param {string} [customerData.customerPhoneNumber]
 * @param {string} [customerData.customerEmailAddress]
 * @returns {{ isValid: boolean, errorMessage: string | null }}
 */
function validateCustomerData(customerData) {
  if (
    customerData === null ||
    typeof customerData !== 'object' ||
    Array.isArray(customerData)
  ) {
    return { isValid: false, errorMessage: 'Invalid customer data payload.' };
  }
  const { customerFirstName, customerLastName, customerPhoneNumber, customerEmailAddress } =
    customerData;

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
      !Number.isFinite(saleLineItem.agreedUnitPriceDollars) ||
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

module.exports = {
  validateSalvagePartData,
  validateCustomerData,
  validateSaleLineItems,
};
