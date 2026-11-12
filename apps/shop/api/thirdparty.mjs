// The third-party mocks of apps/thirdparty as a Vercel function. vercel.json rewrites
// /thirdparty/<script> to /api/thirdparty?path=<script> (and /collect, where the analytics mock
// sends its beacons, to path=collect), so the shop loads them from its own origin.
import { handleThirdParty } from "../../thirdparty/server.mjs";

export default function thirdparty(req, res) {
  const url = new URL(req.url, "http://localhost");
  const path = url.searchParams.get("path");
  url.searchParams.delete("path");
  // Without the query parameter, the platform passed the original path: /thirdparty/<script>
  const pathname = path ? `/${path}` : url.pathname.replace(/^\/thirdparty(?=\/)/, "");
  req.url = `${pathname}${url.search}`;
  return handleThirdParty(req, res);
}
