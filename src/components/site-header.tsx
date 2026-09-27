import Link from "next/link";
import { BookOpen, Scale } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="brand" aria-label="CivPro Practice home">
          <span className="brand__mark"><Scale size={19} strokeWidth={1.8} /></span>
          <span>
            <strong>CivPro Practice</strong>
            <small>Evidence-grounded feedback</small>
          </span>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link href="/student"><BookOpen size={16} /> Student experience</Link>
        </nav>
      </div>
    </header>
  );
}
