export function interpretMeResponse(input: {
  networkError?: boolean;
  status?: number | null;
}): { signedOut: boolean; clearCookie: boolean };
