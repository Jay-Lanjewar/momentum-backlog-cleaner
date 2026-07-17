import { Sparkles, Layers, User } from "lucide-react"
import { NavLink } from "react-router-dom"
import { cn } from "@/lib/cn"

const navItems = [
  { to: "/", icon: Sparkles, label: "Today" },
  { to: "/backlog", icon: Layers, label: "Pending Work" },
  { to: "/profile", icon: User, label: "Profile" },
]

export function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60 md:hidden">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )
            }
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-56 lg:w-64 md:flex-col md:fixed md:inset-y-0 z-50 border-r bg-card">
      <div className="flex h-14 items-center gap-2 border-b px-6">
        <Sparkles className="h-5 w-5 text-primary" />
        <span className="font-semibold tracking-tight">Momentum</span>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t p-4">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          Dev Mode
        </div>
      </div>
    </aside>
  )
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background md:pl-56 lg:pl-64 pb-16 md:pb-0">
      <Sidebar />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      <MobileNav />
    </div>
  )
}
