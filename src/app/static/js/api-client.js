export async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }
  return { response, data };
}

export function detailMessage(data, fallback) {
  if (data && typeof data === "object" && typeof data.detail === "string") {
    return data.detail;
  }
  return fallback;
}
