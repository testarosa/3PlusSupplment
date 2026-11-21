import axios from "axios";
import { buildApiUrl } from "./config";

export async function getBillingCodes(query, freightType = "") {
  const params = new URLSearchParams();
  params.set("billingCode", query || "");
  if (freightType) params.set("freightType", freightType);

  const endpoint = buildApiUrl(`/BillingCode/GetBillingCode?${params.toString()}`);

  try {
    const resp = await axios.get(endpoint, {
      headers: { accept: "text/plain, application/json" },
    });
    console.debug("[getBillingCodes] resp status", resp.status);
    let data = resp && resp.data;

    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        /* keep as string */
      }
    }

    // If wrapped in { data: [...] }
    if (
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      Array.isArray(data.data)
    ) {
      data = data.data;
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
