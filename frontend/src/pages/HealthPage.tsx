import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Server, CheckCircle2, AlertCircle } from "lucide-react"

import { Layout } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { FadeIn } from "@/components/ui/fade-in"
import { api } from "@/services/api"

interface HealthResponse {
  status: string
  version: string
  database: string
}

export function HealthPage() {
  const navigate = useNavigate()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const result = await api.get<HealthResponse>("/api/v1/health")
      if (result.error) {
        throw new Error(result.error)
      }
      return result.data
    },
  })

  return (
    <Layout>
      <div className="space-y-6 pb-8">
        <FadeIn>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Server className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">System Health</h1>
              <p className="text-sm text-muted-foreground">Backend connection test</p>
            </div>
          </div>
        </FadeIn>

        {isLoading && (
          <FadeIn delay={0.05}>
            <div className="space-y-3">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          </FadeIn>
        )}

        {error && (
          <FadeIn delay={0.05}>
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/30">
                <AlertCircle className="h-7 w-7 text-red-500" />
              </div>
              <h3 className="text-base font-medium mb-1">Backend unreachable</h3>
              <p className="text-sm text-muted-foreground mb-5 max-w-xs">
                {error instanceof Error ? error.message : "Connection failed"}
              </p>
              <div className="flex gap-3">
                <Button onClick={() => refetch()} className="gap-1.5">
                  Retry
                </Button>
                <Button variant="outline" onClick={() => navigate("/")}>
                  Back Home
                </Button>
              </div>
            </div>
          </FadeIn>
        )}

        {data && (
          <FadeIn delay={0.05}>
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border bg-emerald-50 dark:bg-emerald-950/30 p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">All Systems Operational</span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <span className="text-sm font-medium capitalize">{data.status}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
                  <span className="text-sm text-muted-foreground">Version</span>
                  <span className="text-sm font-medium">{data.version}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
                  <span className="text-sm text-muted-foreground">Database</span>
                  <span className="text-sm font-medium capitalize">{data.database}</span>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={() => navigate("/")}
                className="w-full"
              >
                Back Home
              </Button>
            </div>
          </FadeIn>
        )}
      </div>
    </Layout>
  )
}
