"use client";

import React, { useState, createContext, useContext } from "react";
import Link from "next/link";
import {
  ClerkProvider,
  UserButton,
  useAuth as useClerkAuth,
} from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { KeyRound, X, ExternalLink } from "lucide-react";

// Check if a real Clerk publishable key has been supplied
const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
export const isClerkConfigured = Boolean(
  clerkKey && clerkKey.startsWith("pk_") && !clerkKey.includes("...")
);

interface AuthContextValue {
  userId: string | null;
  getToken: () => Promise<string | null>;
  isLoaded: boolean;
  isSignedIn: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  userId: "local_guest",
  getToken: async () => null,
  isLoaded: true,
  isSignedIn: true,
});

export function useAppAuth() {
  return useContext(AuthContext);
}

function ClerkBridge({ children }: { children: React.ReactNode }) {
  const { userId, getToken, isLoaded, isSignedIn } = useClerkAuth();
  return (
    <AuthContext.Provider
      value={{
        userId: userId || null,
        getToken: async () => {
          try {
            return await getToken();
          } catch {
            return null;
          }
        },
        isLoaded,
        isSignedIn: Boolean(isSignedIn),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AppClerkProvider({ children }: { children: React.ReactNode }) {
  const [bannerDismissed, setBannerDismissed] = useState(false);

  if (isClerkConfigured) {
    return (
      <ClerkProvider
        appearance={{
          ...dark,
          variables: {
            ...dark.variables,
            colorPrimary: "#ffffff",
            colorBackground: "#11141d",
            colorForeground: "#ffffff",
            colorMutedForeground: "#9ca3af",
            borderRadius: "0.75rem",
          },
          elements: {
            card: "border border-white/10 shadow-2xl bg-[#11141d]",
            formButtonPrimary: "bg-white text-black hover:bg-zinc-200 font-semibold shadow-sm",
            socialButtonsBlockButton: "border border-white/10 bg-[#181b24] text-white hover:bg-[#202430]",
            socialButtonsBlockButtonText: "text-white font-medium",
            formFieldLabel: "text-zinc-200 font-medium text-xs",
            formFieldInput: "bg-[#07080b] border-white/15 text-white placeholder-zinc-500",
            footerActionLink: "text-blue-400 hover:text-blue-300 font-medium",
            headerTitle: "text-white text-xl font-bold",
            headerSubtitle: "text-zinc-400 text-sm",
            dividerLine: "bg-white/10",
            dividerText: "text-zinc-400 text-xs",
            identityPreviewText: "text-zinc-200 font-medium",
            identityPreviewEditButtonIcon: "text-zinc-400",
          },
        } as any}
      >
        <ClerkBridge>{children}</ClerkBridge>
      </ClerkProvider>
    );
  }

  // Graceful fallback for local development before keys are added
  return (
    <AuthContext.Provider
      value={{
        userId: "local_guest",
        getToken: async () => null,
        isLoaded: true,
        isSignedIn: true,
      }}
    >
      {!bannerDismissed && (
        <div className="relative z-50 flex items-center justify-between border-b border-blue-500/20 bg-blue-950/40 px-4 py-2 text-xs text-blue-200 backdrop-blur-sm">
          <div className="flex items-center gap-2 mx-auto sm:mx-0">
            <KeyRound className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            <span>
              <strong>Auth Ready:</strong> Running in local demo mode. To enable live Google/Email login, add your free{" "}
              <a
                href="https://dashboard.clerk.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-white underline hover:text-blue-300"
              >
                Clerk API keys <ExternalLink className="h-2.5 w-2.5" />
              </a>{" "}
              to <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-[11px] text-blue-300">frontend/.env.local</code>.
            </span>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="rounded p-1 text-blue-300 hover:bg-white/10 hover:text-white"
            title="Dismiss notice"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
}

export function AppSignedIn({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAppAuth();
  if (!isClerkConfigured) {
    return <>{children}</>;
  }
  if (!isLoaded || !isSignedIn) {
    return null;
  }
  return <>{children}</>;
}

export function AppSignedOut({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAppAuth();
  if (!isClerkConfigured) {
    return null;
  }
  if (!isLoaded || isSignedIn) {
    return null;
  }
  return <>{children}</>;
}

export function AppUserButton() {
  if (isClerkConfigured) {
    return (
      <UserButton
        appearance={{
          elements: {
            userButtonAvatarBox: "h-8 w-8 rounded-full border border-white/20",
          },
        }}
      />
    );
  }

  return (
    <div
      className="flex items-center gap-2 rounded-lg p-1 transition"
      title="Guest Mode (Connect Clerk in .env.local for live accounts)"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 border border-white/15 text-xs font-bold text-white">
        GC
      </div>
      <div className="hidden md:flex flex-col text-left">
        <span className="text-xs font-semibold text-zinc-200">Guest Creator</span>
        <span className="text-[10px] text-zinc-500">Local Mode</span>
      </div>
    </div>
  );
}
