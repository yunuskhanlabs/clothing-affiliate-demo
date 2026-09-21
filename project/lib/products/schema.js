/**
 * Product data contract — Part 2.
 *
 * This is the shape every product object must satisfy, whether it comes
 * from `mock-data.js` (this phase) or Supabase (Part 3). Nothing in
 * `components/product/*` or `components/catalog/*` should reach for a
 * field that isn't listed here — that's what keeps the swap to a real
 * backend a data-source change, not a UI rewrite.
 *
 * @typedef {Object} ProductColor
 * @property {string} name  Display name, e.g. "Charcoal"
 * @property {string} hex   Swatch color, e.g. "#3a3a3a"
 *
 * @typedef {Object} Product
 * @property {string} id                 Stable unique id (e.g. "p-0001")
 * @property {string} name                Display name
 * @property {string} slug                URL slug, unique, kebab-case
 * @property {string} brand               Brand display name
 * @property {"men"|"women"|"kids"} category
 * @property {string} subcategory         e.g. "t-shirts", "jeans", "hoodies"
 * @property {string} description         1–3 sentence product description
 * @property {string[]} images            1+ image URLs, first = primary
 * @property {number} price               Current price (INR, integer rupees)
 * @property {number} originalPrice       MRP — equal to price if no discount
 * @property {number} discountPercentage  0–100, derived but stored for sort/filter
 * @property {number} rating              0–5, one decimal
 * @property {number} reviewCount         integer
 * @property {ProductColor[]} colors
 * @property {string[]} sizes             e.g. ["S","M","L","XL"]
 * @property {string} material            e.g. "100% Cotton"
 * @property {string} fit                 e.g. "Oversized", "Regular", "Slim"
 * @property {string} occasion            e.g. "Casual", "Formal", "Athleisure"
 * @property {string[]} tags              e.g. ["new","trending","bestseller","deal"]
 * @property {"in_stock"|"low_stock"|"out_of_stock"} availability
 * @property {string} store               Partner/merchant placeholder name
 * @property {string} affiliateUrl        Placeholder only — never a real redirect in Part 2
 * @property {string[]} badges            Small UI badges, e.g. ["Bestseller"]
 * @property {string} createdAt           ISO date string
 * @property {string} updatedAt           ISO date string
 */

export {};
