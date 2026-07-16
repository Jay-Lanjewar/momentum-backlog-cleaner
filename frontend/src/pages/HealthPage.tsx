import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { api } from "@/services/api";

interface HealthResponse {
  status: string;
  version: string;
  database: string;
}

export function HealthPage() {
  const navigate = useNavigate();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const result = await api.get<HealthResponse>("/api/v1/health");
      if (result.error) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">System Health</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Backend connection test
        </p>
      </div>

      <div className="w-full max-w-md rounded-lg border p-6">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}

        {error && (
          <div className="text-center">
            <div className="mb-2 text-3xl">❌</div>
            <p className="text-red-500">Backend unreachable</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Connection failed"}
            </p>
            <div className="mt-4 flex justify-center gap-4">
              <Button onClick={() => refetch()}>Retry</Button>
              <Button variant="outline" onClick={() => navigate("/")}>
                Back Home
              </Button>
            </div>
          </div>
        )}

        {data && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <span className="text-lg font-semibold">All Systems Operational</span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between rounded-md bg-secondary p-3">
                <span className="text-sm text-muted-foreground">Status</span>
                <span className="text-sm font-medium capitalize">{data.status}</span>
              </div>
              <div className="flex justify-between rounded-md bg-secondary p-3">
                <span className="text-sm text-muted-foreground">Version</span>
                <span className="text-sm font-medium">{data.version}</span>
              </div>
              <div className="flex justify-between rounded-md bg-secondary p-3">
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
        )}
      </div>
    </div>
  );
}
