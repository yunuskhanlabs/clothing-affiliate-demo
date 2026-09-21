export function formatPrice(amount) {
  if (typeof amount !== "number") return "";
  return `₹${amount.toLocaleString("en-IN")}`;
}
