const handler = require("../server-core");

module.exports = (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = String(url.searchParams.get("path") || "").replace(/^\/+/, "");
  const nextParams = new URLSearchParams(url.searchParams);
  nextParams.delete("path");
  const query = nextParams.toString();

  req.url = `/api${path ? `/${path}` : ""}${query ? `?${query}` : ""}`;
  return handler(req, res);
};
