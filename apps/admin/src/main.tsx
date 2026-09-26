import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import React from "react";
import ReactDOM from "react-dom/client";
import { toast } from "sonner";
import { router } from "@/app/router";
import { Toaster } from "@/components/ui/sonner";
import { errorMessage } from "@/lib/api";
import "./index.css";

// Los errores de las acciones se avisan solo con un toast, nunca dentro del formulario.
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => toast.error(errorMessage(error)),
  }),
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
});

const root = document.getElementById("root");
if (!root) throw new Error("Root element is missing");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster position="top-center" richColors />
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
