import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const isClerkConfigured = Boolean(
  clerkKey && clerkKey.startsWith("pk_") && !clerkKey.includes("...")
);

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/split(.*)",
  "/api(.*)",
  "/output(.*)",
]);

export default function middleware(req: NextRequest, evt: any) {
  // If Clerk keys have not been added yet, bypass middleware in local dev demo mode
  if (!isClerkConfigured) {
    return NextResponse.next();
  }

  // Execute Clerk's standard auth middleware
  return clerkMiddleware(async (auth, request) => {
    if (!isPublicRoute(request)) {
      await auth.protect();
    }
  })(req, evt);
}

export const config = {
  matcher: [
    "/((?!_next|api|output|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
