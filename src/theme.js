// Brand palette — pulled from the Whites & Brights logo (navy + teal),
// paired with a neutral modern-dashboard gray scale.
export const C = {
  // Brand
  navy: "#163A52",
  navyDark: "#0E2A3D",
  navyDeep: "#0A2231",
  navyLine: "#22506E",
  navyMute: "#7C97AA",
  teal: "#2BA9C7",
  tealDark: "#1E8BA3",
  tealLight: "#E7F4F8",
  tealMid: "#5FC4DA",
  tealSoft: "#F2F9FB",   // very pale wash for icon circles

  // Neutrals (modern dashboard)
  bg: "#F4F6F8",         // page background
  paper: "#FAFBFC",      // sections inside cards
  card: "#FFFFFF",
  border: "#E6EAEE",
  borderSoft: "#EFF2F5",
  text: "#0F2030",
  textMute: "#5C6B78",
  textFaint: "#92A0AC",

  // Status
  green: "#1FA971",
  greenLt: "#E4F6EE",
  red: "#E0484D",
  redLt: "#FBEAEB",
  amber: "#D8902A",
  amberLt: "#FBF1E0",
};

// Single, clean modern sans — no editorial serif anymore.
export const SANS    = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const DISPLAY = SANS;
export const SERIF   = SANS; // kept as alias so older imports don't break

// Motion — quick, modern, springy-ish but restrained.
export const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

// Existing standalone constants — unchanged.
export const KANBAN = [
  "Order Placed",
  "Picked up by Delivery Van",
  "Delivered at Plant",
  "Received at Plant",
  "Sorting & Processing",
  "Packing & Dispatch",
  "Out for Delivery",
  "Delivered",
];

export const SERVICE_TYPES = [
  "Laundry",
  "Ironing",
  "Laundry & Ironing",
  "Dry Clean",
  "Other Services",
];

export const PAYMENT_METHODS = ["UPI", "Cash", "Card", "Cheque"];

// How many garments the plant can process in a single day. Used by the
// POS to stop a delivery date being booked past what we can actually
// turn around, so we don't over-promise and run late.
export const DAILY_CAPACITY = 250;

// Money actually collected on an order. Fully-paid orders have collected
// their whole total; "Partial" orders only the recorded advance; unpaid
// orders nothing. One source of truth for every revenue calculation.
export const collected = (o) =>
  o.payment_status === "Paid" ? Number(o.total || 0) : Number(o.amount_paid || 0);

// What's still owed on an order (never negative).
export const balanceDue = (o) => Math.max(0, Number(o.total || 0) - collected(o));

export const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

export const STORE = {
  name: "Whites & Brights",
  tagline: "Laundry · Dry Clean · Express Care",
  phone: "9308140181",
  address: "Patna · Bihar",
};
