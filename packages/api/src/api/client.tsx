/** Transport injection and the React Query provider shared by every hook. */
import type { Transport } from "../transport/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";

const ApiContext = createContext<Transport | null>(null);

/** Injects the host-specific transport and the application query cache. */
export function ApiProvider({
    transport,
    children,
    queryClient: providedQueryClient,
}: {
    transport: Transport;
    children: ReactNode;
    /** A test may supply a client with retries disabled; hosts use the default cache. */
    queryClient?: QueryClient;
}) {
    const [queryClient] = useState(
        () =>
            providedQueryClient ??
            new QueryClient({
                defaultOptions: { queries: { refetchOnWindowFocus: false } },
            }),
    );
    return (
        <QueryClientProvider client={queryClient}>
            <ApiContext.Provider value={transport}>{children}</ApiContext.Provider>
        </QueryClientProvider>
    );
}

export function useTransport(): Transport {
    const transport = useContext(ApiContext);
    if (transport === null) {
        throw new Error("ApiProvider is missing above this component.");
    }
    return transport;
}
