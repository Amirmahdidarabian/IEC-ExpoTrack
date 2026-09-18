import { Brand } from "./Brand";
import Link from "next/link";

export function Footer() {
  return <footer className="site-footer"><div className="footer-brand"><Brand compact /><span><b>International Energy Club</b><small>Connecting energy markets</small></span></div><div><Link href="/resources#privacy">Privacy</Link><Link href="/resources#terms">Terms</Link><a href="mailto:hello@internationalenergy.club">Help</a></div></footer>;
}
