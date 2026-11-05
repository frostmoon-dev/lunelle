// Unit conversions. Exact definitions, no rounding.
export const KJ_PER_KCAL = 4.184;
export const KG_PER_LB = 0.45359237;
export const CM_PER_INCH = 2.54;

export const kcalToKj = (kcal) => kcal * KJ_PER_KCAL;
export const kjToKcal = (kj) => kj / KJ_PER_KCAL;
export const lbToKg = (lb) => lb * KG_PER_LB;
export const kgToLb = (kg) => kg / KG_PER_LB;
export const inchToCm = (inch) => inch * CM_PER_INCH;
export const cmToInch = (cm) => cm / CM_PER_INCH;
