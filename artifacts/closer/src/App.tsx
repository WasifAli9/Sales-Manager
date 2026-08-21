import * as React from "react"
import { useLocation, Router, Switch, Route } from "wouter"
import { AppLayout } from "./components/layout"
import { Toaster } from "./components/ui/toaster"
import { TooltipProvider } from "./components/ui/tooltip"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ErrorBoundary } from "./components/error-boundary"
import { useAuth } from "@/hooks/use-auth"
import { ThemeProvider } from "@/hooks/use-theme"
import { GenerationProvider } from "@/contexts/generation-context"
import { GenerationWidget } from "@/components/generation-widget"
import NotFound from "./pages/not-found"
import LoginPage from "./pages/login"
import ForgotPasswordPage from "./pages/forgot-password"
import ResetPasswordPage from "./pages/reset-password"
import AcceptInvitePage from "./pages/accept-invite"

// Pages
import TodayPage from "./pages/today"
import ProductsPage from "./pages/products"
import ProductDetail from "./pages/product-detail"
import ProductSectionIntelligence from "./pages/product-section-intelligence"
import ProductSectionStrategist from "./pages/product-section-strategist"
import ProductSectionDocuments from "./pages/product-section-documents"
import ProductSectionEmail from "./pages/product-section-email"
import ProductEmailSequences from "./pages/product-email-sequences"
import ProductEmailSequenceBuilder from "./pages/product-email-sequence-builder"
import ProductEmailLists from "./pages/product-email-lists"
import ProductSectionSocial from "./pages/product-section-social"
import GoalsPage from "./pages/goals"
import StackPage from "./pages/stack"
import VisionPage from "./pages/vision"
import ChatPage from "./pages/chat"
import SettingsPage from "./pages/settings"
import TargetsPage from "./pages/targets"
import PipelinePage from "./pages/pipeline"
import LeadsPage from "./pages/leads"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      retry: false,
    },
  },
})

// Wouter needs the base stripped from the window.location before routing
const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || ""

function WouterRouter({ children }: { children: React.ReactNode }) {
  return <Router base={base}>{children}</Router>
}

function RoutedErrorBoundary({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <WouterRouter>
        <Switch>
          <Route path="/forgot-password" component={ForgotPasswordPage} />
          <Route path="/reset-password" component={ResetPasswordPage} />
          <Route path="/accept-invite" component={AcceptInvitePage} />
          <Route component={LoginPage} />
        </Switch>
      </WouterRouter>
    )
  }

  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <TooltipProvider>
        <AuthGuard>
          <GenerationProvider>
          <WouterRouter>
            <AppLayout>
              <RoutedErrorBoundary>
                <Switch>
                  <Route path="/" component={TodayPage} />
                  <Route path="/products" component={ProductsPage} />
                  <Route path="/products/:id" component={ProductDetail} />
                  <Route path="/products/:id/intelligence" component={ProductSectionIntelligence} />
                  <Route path="/products/:id/strategist" component={ProductSectionStrategist} />
                  <Route path="/products/:id/documents" component={ProductSectionDocuments} />
                  <Route path="/products/:id/email/sequences/new" component={ProductEmailSequenceBuilder} />
                  <Route path="/products/:id/email/sequences/:sequenceId" component={ProductEmailSequenceBuilder} />
                  <Route path="/products/:id/email/sequences" component={ProductEmailSequences} />
                  <Route path="/products/:id/email/lists" component={ProductEmailLists} />
                  <Route path="/products/:id/email" component={ProductSectionEmail} />
                  <Route path="/products/:id/social" component={ProductSectionSocial} />
                  <Route path="/goals" component={GoalsPage} />
                  <Route path="/stack" component={StackPage} />
                  <Route path="/vision" component={VisionPage} />
                  <Route path="/chat" component={ChatPage} />
                  <Route path="/settings" component={SettingsPage} />
                  <Route path="/targets/:id" component={TargetsPage} />
                  <Route path="/pipeline/:id" component={PipelinePage} />
                  <Route path="/leads" component={LeadsPage} />
                  <Route component={NotFound} />
                </Switch>
              </RoutedErrorBoundary>
            </AppLayout>
          </WouterRouter>
          <GenerationWidget />
          </GenerationProvider>
        </AuthGuard>
        <Toaster />
      </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
