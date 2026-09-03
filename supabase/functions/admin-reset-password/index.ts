import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create a client with the caller's JWT to verify admin status
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the caller is an admin
    const { data: adminCheck, error: adminErr } = await userClient.rpc("is_current_admin");
    if (adminErr || !adminCheck) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { userId } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: "Missing userId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate a random 12-char alphanumeric password
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let tempPassword = "";
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 12; i++) {
      tempPassword += chars[bytes[i] % chars.length];
    }

    // Use service role client to reset the password
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { error: updateErr } = await adminClient.auth.admin.updateUserById(userId, {
      password: tempPassword,
    });

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Set the must_change_password flag
    const { error: flagErr } = await userClient.rpc("set_must_change_password", {
      p_user_id: userId,
    });

    if (flagErr) {
      // Password was reset but flag failed — not critical
      console.error("Failed to set must_change_password flag:", flagErr.message);
    }

    return new Response(JSON.stringify({ tempPassword }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
