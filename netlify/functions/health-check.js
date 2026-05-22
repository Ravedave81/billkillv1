const { createClient } = require("@supabase/supabase-js");

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase ist noch nicht konfiguriert: SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY fehlen.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store"
      }
    };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ ok: false, error: "Method not allowed" })
    };
  }

  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from("invoice_counters")
      .select("invoice_year", { count: "exact", head: true })
      .limit(1);

    if (error) throw error;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ ok: true, message: "Supabase ist erreichbar." })
    };
  } catch (error) {
    return {
      statusCode: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        ok: false,
        error: String(error.message || error),
        message: "Supabase antwortet nicht. Bitte Projekt im Supabase Dashboard prüfen oder reaktivieren."
      })
    };
  }
};
