"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  HouseLine, SquaresFour, CalendarDots, MapPinArea, AddressBook, Receipt,
  Images, ChartLineUp, SlidersHorizontal, UsersThree, SignOut, Package, Buildings,
} from "@phosphor-icons/react";
import { useUser } from "./UserProvider";

const GROUPS = [
  {
    label: "Home",
    items: [
      { href: "/", label: "Dashboard", icon: SquaresFour },
      { href: "/schedule", label: "Schedule", icon: CalendarDots },
      { href: "/discover", label: "Find pros", icon: MapPinArea },
      { href: "/materials", label: "Materials", icon: Package },
    ],
  },
  {
    label: "Records",
    items: [
      { href: "/properties", label: "Properties", icon: Buildings },
      { href: "/contractors", label: "Contractors", icon: AddressBook },
      { href: "/invoices", label: "Invoices", icon: Receipt },
      { href: "/photos", label: "Job photos", icon: Images },
      { href: "/reports", label: "Reports", icon: ChartLineUp },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/contractors/new", label: "Contractor CMS", icon: SlidersHorizontal },
      { href: "/users", label: "Users & roles", icon: UsersThree },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/contractors")
    // Contractors stays active on the profile, but not on the CMS form
    return pathname.startsWith("/contractors") && !pathname.includes("/new") && !pathname.includes("/edit");
  if (href === "/contractors/new")
    return pathname === "/contractors/new" || pathname.endsWith("/edit");
  return pathname.startsWith(href);
}

export function NavRail() {
  const pathname = usePathname();
  const user = useUser();
  const router = useRouter();
  const initials = user.name.split(" ").map((w) => w[0]).slice(0, 2).join("");

  return (
    <aside className="side">
      <div className="brand">
        <span className="brand-mark"><HouseLine size={16} weight="regular" /></span>
        <span className="brand-name">Homestead</span>
      </div>
      <nav className="side-nav">
        {GROUPS.map((g) => (
          <div className="side-group" key={g.label}>
            <div className="side-group-label">{g.label}</div>
            {g.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="nav-item"
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                >
                  <Icon size={17} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="account-chip">
        <span className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>{initials}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {user.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--color-accent-text)", textTransform: "capitalize" }}>
            {user.role}
          </div>
        </div>
        <button
          className="btn btn-icon"
          style={{ width: 30, height: 30, minHeight: 30 }}
          title="Sign out"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/login");
            router.refresh();
          }}
        >
          <SignOut size={14} />
        </button>
      </div>
    </aside>
  );
}
