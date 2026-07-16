import { CalendarDays } from "lucide-react"
import { Layout } from "@/components/layout"

export function PlanPage() {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <CalendarDays className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold">Weekly Plan</h2>
        <p className="text-sm text-muted-foreground mt-1">Coming soon</p>
      </div>
    </Layout>
  )
}
