import { useState, useEffect } from "react";
import { Fingerprint, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  browserSupportsWebAuthn,
  usePasskeyRegistration,
  listCredentials,
} from "@/hooks/use-webauthn";

const DISMISSED_KEY = "closer:passkey-dismissed";

export function PasskeySetupBanner() {
  const [visible, setVisible] = useState(false);
  const { register, state, error } = usePasskeyRegistration();

  useEffect(() => {
    if (!browserSupportsWebAuthn()) return;
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    // Only show if user has no passkeys yet
    listCredentials()
      .then((creds) => {
        if (creds.length === 0) setVisible(true);
      })
      .catch(() => {}); // not authenticated yet — skip
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  };

  const handleRegister = async () => {
    const ok = await register();
    if (ok) {
      setTimeout(dismiss, 1800);
    }
  };

  if (!visible) return null;

  return (
    <div className="mx-4 mb-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 flex items-start gap-3">
      <div className="mt-0.5 shrink-0">
        {state === "success" ? (
          <CheckCircle2 className="w-5 h-5 text-green-400" />
        ) : (
          <Fingerprint className="w-5 h-5 text-primary" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        {state === "success" ? (
          <p className="text-sm font-semibold text-green-400">
            Biometric login enabled — you'll sign in automatically next time.
          </p>
        ) : (
          <>
            <p className="text-sm font-semibold text-foreground leading-tight">
              Enable biometric login
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Use Face ID or fingerprint to sign in instantly next time.
            </p>
            {error && (
              <p className="text-xs text-destructive mt-1">{error}</p>
            )}
            <Button
              size="sm"
              onClick={handleRegister}
              disabled={state === "loading"}
              className="mt-2 h-8 text-xs rounded-xl bg-primary text-primary-foreground"
            >
              {state === "loading" ? "Setting up…" : "Set up now"}
            </Button>
          </>
        )}
      </div>

      {state !== "success" && (
        <button
          onClick={dismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
