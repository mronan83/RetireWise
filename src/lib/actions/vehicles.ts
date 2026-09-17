"use server";

import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { vehicles } from "../db/schema";
import { snapshotNetWorth } from "../utils/net-worth-snapshot";
import { recordItemHistory } from "../utils/record-item-history";

type VehicleInput = {
  owner: "self" | "spouse";
  name: string;
  vehicleType: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  vin?: string;
  mileage?: number;
  condition?: string;
  estimatedValue: number;
  lastValuationDate?: string;
  hasLoan: boolean;
  loanBalance?: number;
  loanRate?: number;
  loanMonthlyPayment?: number;
  loanRemainingMonths?: number;
  purchasePrice?: number;
  purchaseDate?: string;
  notes?: string;
};

export async function addVehicle(input: VehicleInput) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const db = getDb();
  const [inserted] = await db.insert(vehicles).values({
    clerkId: userId,
    owner: input.owner,
    name: input.name,
    vehicleType: input.vehicleType as typeof vehicles.$inferInsert.vehicleType,
    year: input.year || null,
    make: input.make || null,
    model: input.model || null,
    trim: input.trim || null,
    vin: input.vin || null,
    mileage: input.mileage || null,
    condition: input.condition || null,
    estimatedValue: String(input.estimatedValue),
    lastValuationDate: input.lastValuationDate || null,
    hasLoan: input.hasLoan,
    loanBalance: input.hasLoan ? String(input.loanBalance || 0) : "0",
    loanRate: input.hasLoan && input.loanRate ? String(input.loanRate) : null,
    loanMonthlyPayment: input.hasLoan && input.loanMonthlyPayment ? String(input.loanMonthlyPayment) : null,
    loanRemainingMonths: input.hasLoan ? input.loanRemainingMonths || null : null,
    purchasePrice: input.purchasePrice ? String(input.purchasePrice) : null,
    purchaseDate: input.purchaseDate || null,
    notes: input.notes || null,
  }).returning({ id: vehicles.id, name: vehicles.name });
  if (inserted) {
    const loanBal = input.hasLoan ? (input.loanBalance || 0) : 0;
    const equity = input.estimatedValue - loanBal;
    recordItemHistory(userId, "vehicle", inserted.id, inserted.name, equity, input.estimatedValue).catch(() => {});
  }

  revalidatePath("/net-worth");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateVehicle(id: string, input: Partial<VehicleInput>) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const db = getDb();
  const existing = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.clerkId, userId)))
    .limit(1);
  if (existing.length === 0) throw new Error("Vehicle not found");

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (input.owner !== undefined) set.owner = input.owner;
  if (input.name !== undefined) set.name = input.name;
  if (input.vehicleType !== undefined) set.vehicleType = input.vehicleType;
  if (input.year !== undefined) set.year = input.year;
  if (input.make !== undefined) set.make = input.make;
  if (input.model !== undefined) set.model = input.model;
  if (input.trim !== undefined) set.trim = input.trim;
  if (input.vin !== undefined) set.vin = input.vin;
  if (input.mileage !== undefined) set.mileage = input.mileage;
  if (input.condition !== undefined) set.condition = input.condition;
  if (input.estimatedValue !== undefined) set.estimatedValue = String(input.estimatedValue);
  if (input.lastValuationDate !== undefined) set.lastValuationDate = input.lastValuationDate;
  if (input.hasLoan !== undefined) set.hasLoan = input.hasLoan;
  if (input.loanBalance !== undefined) set.loanBalance = String(input.loanBalance);
  if (input.loanRate !== undefined) set.loanRate = input.loanRate ? String(input.loanRate) : null;
  if (input.loanMonthlyPayment !== undefined) set.loanMonthlyPayment = input.loanMonthlyPayment ? String(input.loanMonthlyPayment) : null;
  if (input.loanRemainingMonths !== undefined) set.loanRemainingMonths = input.loanRemainingMonths;
  if (input.purchasePrice !== undefined) set.purchasePrice = input.purchasePrice ? String(input.purchasePrice) : null;
  if (input.purchaseDate !== undefined) set.purchaseDate = input.purchaseDate;
  if (input.notes !== undefined) set.notes = input.notes;

  await db.update(vehicles).set(set).where(eq(vehicles.id, id));

  // Record item history if value was updated
  if (input.estimatedValue !== undefined || input.loanBalance !== undefined) {
    // Re-fetch to get current values
    const [current] = await db
      .select({ name: vehicles.name, estimatedValue: vehicles.estimatedValue, hasLoan: vehicles.hasLoan, loanBalance: vehicles.loanBalance })
      .from(vehicles)
      .where(eq(vehicles.id, id))
      .limit(1);
    if (current) {
      const loanBal = current.hasLoan ? Number(current.loanBalance || 0) : 0;
      const equity = Number(current.estimatedValue) - loanBal;
      recordItemHistory(userId, "vehicle", id, current.name, equity, Number(current.estimatedValue)).catch(() => {});
    }
  }

  await snapshotNetWorth(userId).catch(() => {});
  revalidatePath("/net-worth");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteVehicle(id: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const db = getDb();
  await db.delete(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.clerkId, userId)));

  revalidatePath("/net-worth");
  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Decode a VIN using the free NHTSA API.
 * Returns year, make, model, trim, and vehicle type.
 */
export async function decodeVIN(vin: string) {
  const resp = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(vin)}?format=json`
  );
  if (!resp.ok) throw new Error("VIN decode failed");

  const data = await resp.json();
  const results = data.Results as { Variable: string; Value: string | null }[];

  function get(variable: string): string {
    return results.find((r) => r.Variable === variable)?.Value?.trim() || "";
  }

  const bodyClass = get("Body Class").toLowerCase();
  let vehicleType = "car";
  if (bodyClass.includes("truck") || bodyClass.includes("pickup")) vehicleType = "truck";
  else if (bodyClass.includes("suv") || bodyClass.includes("sport utility")) vehicleType = "suv";
  else if (bodyClass.includes("motorcycle")) vehicleType = "motorcycle";
  else if (bodyClass.includes("bus") || bodyClass.includes("rv") || bodyClass.includes("motor home")) vehicleType = "rv";
  else if (bodyClass.includes("trailer")) vehicleType = "camper";

  const vType = get("Vehicle Type").toLowerCase();
  if (vType.includes("motorcycle")) vehicleType = "motorcycle";
  if (vType.includes("trailer")) vehicleType = "camper";
  if (vType.includes("boat")) vehicleType = "boat";

  return {
    year: parseInt(get("Model Year")) || null,
    make: get("Make") || null,
    model: get("Model") || null,
    trim: get("Trim") || null,
    vehicleType,
    bodyClass: get("Body Class") || null,
  };
}
