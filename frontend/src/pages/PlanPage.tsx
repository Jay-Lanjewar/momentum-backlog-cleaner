import { CalendarDays, ArrowRight } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Layout } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { FadeIn } from "@/components/ui/fade-in"

export function PlanPage() {
  const navigate = useNavigate()

  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <FadeIn>
          <div className="space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mx-auto">
              <CalendarDays className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Weekly Plan</h2>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                A detailed weekly view is coming soon. Your daily mission is already planned on the home page.
              </p>
            </div>
            <Button
              onClick={() => navigate("/")}
              variant="outline"
              className="gap-2"
            >
              Back to Today
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </FadeIn>
      </div>
    </Layout>
  )
}
