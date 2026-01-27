import axios from "axios";
import { buildApiUrl } from "./config";

export async function getBillingCodes(query) {
  
  const endpoint = buildApiUrl(
    `/BillingCode/GetBillingCode?billingCode=${encodeURIComponent(query || "")}`
  );

  try {
    const resp = await axios.get(endpoint, {
      headers: { accept: "text/plain, application/json" },
    });
    console.debug("[getBillingCodes] resp status", resp.status);
    let data = resp && resp.data;

    // If wrapped in { data: [...] }
    if (
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      Array.isArray(data.data)
    ) {
      data = data.data;
    }

    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (e) {
        /* keep as string */
      }
    }

    if (Array.isArray(data)) {
      // expect items like { name, value }
      return data.map((it, idx) => ({
        name: it.name ?? it.Name ?? String(it),
        value: it.value ?? it.Value ?? idx,
      }));
    }

    return [];
  } catch (err) {
    console.warn("getBillingCodes error", err?.message || err);
    return [];
  }
}
