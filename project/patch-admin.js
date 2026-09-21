const fs = require('fs');
const files = [
  'app/api/admin/analytics/partner/route.js',
  'app/api/admin/analytics/product/route.js',
  'app/api/admin/audit-logs/route.js',
  'app/api/admin/automation/route.js',
  'app/api/admin/brands/route.js',
  'app/api/admin/categories/route.js',
  'app/api/admin/content/route.js',
  'app/api/admin/dashboard/route.js',
  'app/api/admin/deals/route.js',
  'app/api/admin/dlq/route.js',
  'app/api/admin/partners/route.js',
  'app/api/admin/products/route.js'
];

files.forEach(file => {
  let code = fs.readFileSync(file, 'utf8');
  if (!code.includes('requireAdmin')) {
    code = code.replace('import { NextResponse } from "next/server";', 'import { NextResponse } from "next/server";\nimport { requireAdmin } from "@/lib/admin/auth";');
    code = code.replace(/(export async function [A-Z]+\([^)]*\)\s*{)/g, '$1\n  const admin = await requireAdmin();\n  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });\n');
    fs.writeFileSync(file, code);
    console.log('Updated ' + file);
  }
});
