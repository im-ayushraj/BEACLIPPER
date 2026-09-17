export interface CreditAccount {
  user_id: string;
  balance: number;
  currency: string;
}

export interface CreditTransaction {
  id: number;
  amount: number;
  type: string;
  reference_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface CostEstimate {
  operation: string;
  duration_seconds: number;
  estimated_credits: number;
  available_credits: number;
  can_afford: boolean;
  rate_per_minute?: number;
}

export interface UserUsageSummary {
  user_id: string;
  total_jobs: number;
  total_duration_minutes: number;
  total_clips_generated: number;
  total_llm_calls: number;
  balance: number;
}

export interface PlanDefinition {
  id: string;
  name: string;
  display_name: string;
  monthly_price_cents: number;
  monthly_credits: number;
  max_duration_minutes: number;
}

export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price_cents: number;
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

function getHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export async function getUserCredits(token?: string | null): Promise<CreditAccount> {
  try {
    const res = await fetch(`${BASE_URL}/api/credits`, {
      headers: getHeaders(token),
    });
    if (!res.ok) {
      return { user_id: "guest_user", balance: 100, currency: "credits" };
    }
    return await res.json();
  } catch (err) {
    console.warn("Failed to fetch user credits", err);
    return { user_id: "guest_user", balance: 100, currency: "credits" };
  }
}

export async function getCreditTransactions(
  limit: number = 20,
  offset: number = 0,
  token?: string | null
): Promise<{ user_id: string; transactions: CreditTransaction[]; count: number }> {
  try {
    const res = await fetch(`${BASE_URL}/api/credits/transactions?limit=${limit}&offset=${offset}`, {
      headers: getHeaders(token),
    });
    if (!res.ok) {
      return { user_id: "guest_user", transactions: [], count: 0 };
    }
    return await res.json();
  } catch (err) {
    console.warn("Failed to fetch credit transactions", err);
    return { user_id: "guest_user", transactions: [], count: 0 };
  }
}

export async function estimateOperationCost(
  operation: string = "ai_clipper",
  durationSeconds?: number,
  url?: string,
  token?: string | null
): Promise<CostEstimate> {
  const params = new URLSearchParams();
  params.set("operation", operation);
  if (durationSeconds) params.set("duration_seconds", String(durationSeconds));
  if (url) params.set("url", url);

  const res = await fetch(`${BASE_URL}/api/credits/estimate?${params.toString()}`, {
    headers: getHeaders(token),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Unable to calculate cost estimate");
  }

  return await res.json();
}

export async function getUserUsageSummary(token?: string | null): Promise<UserUsageSummary> {
  try {
    const res = await fetch(`${BASE_URL}/api/usage`, {
      headers: getHeaders(token),
    });
    if (!res.ok) {
      return {
        user_id: "guest_user",
        total_jobs: 0,
        total_duration_minutes: 0,
        total_clips_generated: 0,
        total_llm_calls: 0,
        balance: 100,
      };
    }
    return await res.json();
  } catch (err) {
    console.warn("Failed to fetch usage summary", err);
    return {
      user_id: "guest_user",
      total_jobs: 0,
      total_duration_minutes: 0,
      total_clips_generated: 0,
      total_llm_calls: 0,
      balance: 100,
    };
  }
}

export async function getSubscriptionPlans(): Promise<PlanDefinition[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/plans`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.plans || [];
  } catch {
    return [];
  }
}

export async function getCreditPackages(): Promise<CreditPackage[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/credit-packages`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.packages || [];
  } catch {
    return [];
  }
}
