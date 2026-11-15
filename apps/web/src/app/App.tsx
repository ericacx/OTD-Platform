import { installRefreshHandler } from "@/lib/http/refresh-adapter";

import { AppProviders } from "./providers/app-providers";

// Install once at module load, before any component mounts. The interceptor
// looks up the handler on 401 responses via the module-level registry.
installRefreshHandler();

export function App() {
  return <AppProviders />;
}
