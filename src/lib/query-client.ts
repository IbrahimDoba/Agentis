import { QueryClient } from "@tanstack/react-query"

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        retry: 1,
        // DB-load reduction (Phase 0): stop polling the DB when nobody's
        // looking. refetchIntervalInBackground:false pauses every
        // refetchInterval while the tab is hidden; refetchOnWindowFocus:false
        // kills the refetch-storm that fired on every window refocus.
        refetchOnWindowFocus: false,
        refetchIntervalInBackground: false,
      },
    },
  })
}
