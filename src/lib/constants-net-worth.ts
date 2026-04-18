export const DEBT_TYPE_LABELS: Record<string, string> = {
  mortgage: "Mortgage",
  auto_loan: "Auto Loan",
  student_loan: "Student Loan",
  heloc: "HELOC",
  personal_loan: "Personal Loan",
  credit_card: "Credit Card",
  other_debt: "Other",
};

export const VEHICLE_TYPE_LABELS: Record<string, string> = {
  car: "Car",
  truck: "Truck",
  suv: "SUV",
  motorcycle: "Motorcycle",
  boat: "Boat",
  rv: "RV / Motorhome",
  camper: "Camper / Trailer",
  atv: "ATV / UTV",
  other_vehicle: "Other",
};

export const VEHICLE_CONDITION_LABELS: Record<string, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

/**
 * Build a valuation lookup URL for a vehicle.
 * KBB for cars/trucks/SUVs, NADAguides for RVs/boats/motorcycles.
 */
export function getValuationUrl(vehicle: {
  vehicleType: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
}): { url: string; label: string } {
  const { vehicleType, year, make, model } = vehicle;
  const q = [year, make, model].filter(Boolean).join(" ");

  if (vehicleType === "boat") {
    return {
      url: `https://www.nadaguides.com/Boats?${new URLSearchParams({ keyword: q })}`,
      label: "NADA Boats",
    };
  }
  if (vehicleType === "rv" || vehicleType === "camper") {
    return {
      url: `https://www.nadaguides.com/RVs?${new URLSearchParams({ keyword: q })}`,
      label: "NADA RVs",
    };
  }
  if (vehicleType === "motorcycle") {
    return {
      url: `https://www.nadaguides.com/Motorcycles?${new URLSearchParams({ keyword: q })}`,
      label: "NADA Motorcycles",
    };
  }
  if (vehicleType === "atv") {
    return {
      url: `https://www.nadaguides.com/Motorcycles/ATVs?${new URLSearchParams({ keyword: q })}`,
      label: "NADA ATVs",
    };
  }
  // Default: KBB for cars/trucks/SUVs
  return {
    url: `https://www.kbb.com/whats-my-car-worth/`,
    label: "KBB",
  };
}

export const CASH_TYPE_LABELS: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
  high_yield_savings: "High-Yield Savings",
  money_market: "Money Market",
  cd: "Certificate of Deposit",
  ibonds: "I Bonds",
  emergency_fund: "Emergency Fund",
  other_cash: "Other",
};
