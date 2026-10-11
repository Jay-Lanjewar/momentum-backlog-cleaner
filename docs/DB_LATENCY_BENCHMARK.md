# Database latency benchmark

This benchmark is standalone and diagnostic-only. It does not import or alter
the application engine, pool settings, authentication, API routes, or
database state. It runs `SELECT 1` only and disposes every temporary engine
after measurement.

## Local or backend-worker execution

From the repository's `backend` directory, with the normal backend virtual
environment active and `DATABASE_URL` supplied through the environment:

```powershell
python -m app.tools.db_latency_benchmark --fresh-trials 3 --warm-trials 5
```

The output contains individual milliseconds and medians for:

- fresh connection acquisition;
- `SELECT 1` immediately after each fresh connection;
- repeated `SELECT 1` calls on one warm connection.

The command does not print the database URL or any credential. Keep the
terminal output private because timing data can still reveal deployment
characteristics.

## Temporary Oregon and Singapore workers

To compare network paths without changing the production API:

1. In the Render dashboard, create a temporary private worker from the same
   backend commit and Docker/build configuration as the deployed service.
2. Create one worker in Oregon and one worker in Singapore. Use the same
   database environment variable source as production, but enter the value
   through Render's secret environment-variable UI; do not put it in the
   repository, command line, or worker logs.
3. Set the worker start command to:

   ```text
   python -m app.tools.db_latency_benchmark --fresh-trials 3 --warm-trials 5
   ```

4. Start the Oregon worker, collect its stdout, then stop and delete it.
5. Repeat the same process for Singapore.
6. Compare the three medians, especially fresh connection versus warm
   `SELECT 1`. Keep the trial counts identical and avoid running the workers
   concurrently if the database has strict connection limits.
7. Delete both temporary workers and remove their environment configuration
   after collecting the results.

Do not expose the database URL, passwords, tokens, or Render environment
values in screenshots, tickets, commits, or logs. The benchmark makes no
application writes and should not be used as a health check endpoint.
