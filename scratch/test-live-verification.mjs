import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../project/.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase URL or Anon Key");
  process.exit(1);
}

const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

async function runTests() {
  console.log("=== STARTING LIVE VERIFICATION ===");

  // 1. Test Product Detail Live Data via product_listing view
  console.log("\n--- Testing Product Detail Live Data ---");
  const { data: products, error: prodErr } = await supabaseAnon
    .from("product_listing")
    .select("slug, name, price, store")
    .limit(1);

  if (prodErr) {
    console.error("FAILED to query product_listing:", prodErr.message);
  } else if (products && products.length > 0) {
    const slug = products[0].slug;
    console.log(`Found live product: "${products[0].name}" (slug: ${slug})`);

    const { data: detailRow, error: detailErr } = await supabaseAnon
      .from("product_listing")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (detailErr || !detailRow) {
      console.error("FAILED loading product detail by slug:", detailErr?.message);
    } else {
      console.log("SUCCESS: Loaded product detail row by slug from product_listing!");
      console.log("Product Name:", detailRow.name);
      console.log("Product Brand:", detailRow.brand);
      console.log("Product Price:", detailRow.price);
    }

    const { data: fakeRow } = await supabaseAnon
      .from("product_listing")
      .select("*")
      .eq("slug", "non-existent-product-slug-12345")
      .maybeSingle();
    if (fakeRow === null) {
      console.log("SUCCESS: Invalid product slug safely returned null (404 handled)");
    }
  } else {
    console.log("No products found in product_listing view.");
  }

  // 2. Test User Authentication & User Operations (Profiles & Saved Searches)
  console.log("\n--- Testing User Auth, Profiles & Saved Searches ---");
  const emailA = `test_user_a_${Date.now()}@example.com`;
  const emailB = `test_user_b_${Date.now()}@example.com`;
  const password = "TestPassword123!";

  const { data: authA, error: errA } = await supabaseAnon.auth.signUp({
    email: emailA,
    password: password,
    options: { data: { display_name: "User A" } }
  });

  const { data: authB, error: errB } = await supabaseAnon.auth.signUp({
    email: emailB,
    password: password,
    options: { data: { display_name: "User B" } }
  });

  if (errA || errB) {
    console.error("SignUp error:", errA?.message || errB?.message);
  }

  const clientA = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false }
  });
  await clientA.auth.signInWithPassword({ email: emailA, password });

  const clientB = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false }
  });
  await clientB.auth.signInWithPassword({ email: emailB, password });

  const { data: { user: userA } } = await clientA.auth.getUser();
  const { data: { user: userB } } = await clientB.auth.getUser();

  console.log("User A ID:", userA.id);
  console.log("User B ID:", userB.id);

  // Profile Tests
  console.log("\n--- Profile Tests ---");
  // Own Read
  const { data: profileA, error: profReadErr } = await clientA
    .from("profiles")
    .select("*")
    .eq("id", userA.id)
    .single();

  if (profReadErr) {
    console.error("FAILED profile own-read:", profReadErr.message);
  } else {
    console.log("SUCCESS: Profile own-read:", profileA);
  }

  // Cross-user Read Isolation
  const { data: crossProf, error: crossProfErr } = await clientA
    .from("profiles")
    .select("*")
    .eq("id", userB.id)
    .maybeSingle();

  if (!crossProf) {
    console.log("SUCCESS: Cross-user profile read correctly blocked/empty under RLS.");
  } else {
    console.error("WARNING: User A could read User B profile:", crossProf);
  }

  // Own Profile Update using display_name (even if full_name input was passed)
  const updatedDisplayName = "User A Updated Name";
  const { data: updatedProfile, error: profUpErr } = await clientA
    .from("profiles")
    .update({ display_name: updatedDisplayName })
    .eq("id", userA.id)
    .select()
    .single();

  if (profUpErr) {
    console.error("FAILED profile update:", profUpErr.message);
  } else {
    console.log("SUCCESS: Profile updated successfully:", updatedProfile.display_name);
  }

  // Saved Searches Tests
  console.log("\n--- Saved Searches Tests ---");
  // Create
  const { data: ssCreated, error: ssCreateErr } = await clientA
    .from("saved_searches")
    .insert({ user_id: userA.id, name: "Shirt Search", query_string: "category=men&q=shirt" })
    .select()
    .single();

  if (ssCreateErr) {
    console.error("FAILED saved_searches create:", ssCreateErr.message);
  } else {
    console.log("SUCCESS: Saved search created:", ssCreated.id, ssCreated.name);

    // Read
    const { data: ssList, error: ssReadErr } = await clientA
      .from("saved_searches")
      .select("*")
      .eq("user_id", userA.id);

    if (ssReadErr || !ssList.some(s => s.id === ssCreated.id)) {
      console.error("FAILED saved_searches read:", ssReadErr?.message);
    } else {
      console.log("SUCCESS: Saved search read count:", ssList.length);
    }

    // Update
    const { data: ssUpdated, error: ssUpErr } = await clientA
      .from("saved_searches")
      .update({ name: "Updated Shirt Search", query_string: "category=men&q=linen" })
      .eq("id", ssCreated.id)
      .eq("user_id", userA.id)
      .select()
      .single();

    if (ssUpErr) {
      console.error("FAILED saved_searches update:", ssUpErr.message);
    } else {
      console.log("SUCCESS: Saved search updated:", ssUpdated.name, ssUpdated.query_string);
    }

    // Ownership Isolation Check (User B trying to read/update User A's saved search)
    const { data: crossSS } = await clientB
      .from("saved_searches")
      .select("*")
      .eq("id", ssCreated.id);

    if (!crossSS || crossSS.length === 0) {
      console.log("SUCCESS: Saved search ownership isolation works for READ (User B cannot see User A search).");
    } else {
      console.error("FAILED: User B was able to read User A saved search!");
    }

    const { data: crossUp, error: crossUpErr } = await clientB
      .from("saved_searches")
      .update({ name: "Hacked Search" })
      .eq("id", ssCreated.id)
      .select();

    if (!crossUp || crossUp.length === 0) {
      console.log("SUCCESS: Saved search ownership isolation works for UPDATE (User B cannot update User A search).");
    } else {
      console.error("FAILED: User B was able to update User A saved search!");
    }

    // Delete
    const { error: ssDelErr } = await clientA
      .from("saved_searches")
      .delete()
      .eq("id", ssCreated.id)
      .eq("user_id", userA.id);

    if (ssDelErr) {
      console.error("FAILED saved_searches delete:", ssDelErr.message);
    } else {
      console.log("SUCCESS: Saved search deleted.");
    }
  }

  console.log("\n=== LIVE VERIFICATION COMPLETE ===");
}

runTests().catch(console.error);

