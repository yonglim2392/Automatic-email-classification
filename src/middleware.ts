import { proxy } from "@/proxy"
export default proxy
export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
}
