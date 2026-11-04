import { exactRoute } from "./route.mjs";
import {
  MFA_CHALLENGE,
  MFA_CODE,
  MFA_EMAILS,
  MFA_TEST_SECRET,
  QRCode,
  SESSION_TOKEN,
  bearer,
  empty,
  handledJson,
  json,
  mockState,
  readBody,
  testTotp,
  userForEmail,
} from "./state.mjs";

export const handleLogin = exactRoute(
  "POST",
  "/api/identity/login",
  handleLoginResponse,
);

/** Keep credential, forced enrollment, MFA and direct-login precedence. */
async function handleLoginResponse(context) {
  const { req, res } = context;

  const body = await readBody(req);
  if (mockState.credentials.get(body.email) !== body.password) {
    json(res, 401, { error: "Invalid credentials" });
    return true;
  }
  if (mockState.forceEnrollment) {
    mockState.pendingMfaEmail = body.email;
    mockState.currentUser = { ...userForEmail(body.email), mfaEnabled: false };
    mockState.forceEnrollment = false;
    json(res, 200, {
      user: mockState.currentUser,
      mfaEnrollmentRequired: true,
      challengeToken: MFA_CHALLENGE,
    });
    return true;
  }
  if (
    MFA_EMAILS.has(body.email) ||
    mockState.enrolledMfaEmails.has(body.email)
  ) {
    mockState.pendingMfaEmail = body.email;
    json(res, 200, {
      user: userForEmail(body.email),
      mfaRequired: true,
      challengeToken: MFA_CHALLENGE,
    });
    return true;
  }
  mockState.currentUser = userForEmail(body.email);
  json(res, 200, {
    token: SESSION_TOKEN,
    expiresInSeconds: 86400,
    user: mockState.currentUser,
  });
  return true;
}

export const handleCompleteMfa = exactRoute(
  "POST",
  "/api/identity/login/mfa",
  handleCompleteMfaResponse,
);

/** Consume recovery codes only after the challenge pin matches. */
async function handleCompleteMfaResponse(context) {
  const { req, res } = context;

  const body = await readBody(req);
  const valid =
    body.challengeToken === MFA_CHALLENGE &&
    (body.recoveryCode
      ? mockState.recoveryCodes
          .get(mockState.pendingMfaEmail)
          ?.delete(body.recoveryCode)
      : [MFA_CODE, testTotp()].includes(body.code));
  if (body.challengeToken !== MFA_CHALLENGE || !valid) {
    json(res, 401, { error: "Invalid authenticator or recovery code" });
    return true;
  }
  mockState.currentUser = userForEmail(mockState.pendingMfaEmail);
  json(res, 200, {
    token: SESSION_TOKEN,
    expiresInSeconds: 86400,
    user: mockState.currentUser,
  });
  return true;
}

/** Retain the opaque successful password-reset response. */
export function handleRequestPasswordReset(context) {
  const { pathname, method, res } = context;
  if (!(method === "POST" && pathname === "/api/identity/password/reset"))
    return false;
  empty(res, 204);
  return true;
}

export const handleConfirmPasswordReset = exactRoute(
  "POST",
  "/api/identity/password/reset/confirm",
  handleConfirmPasswordResetResponse,
);

/** Validate the reset pin before replacing the viewer password. */
async function handleConfirmPasswordResetResponse(context) {
  const { req, res } = context;

  const body = await readBody(req);
  if (body.token !== "e2e-reset-token") {
    json(res, 400, { error: "Invalid reset token" });
    return true;
  }
  mockState.credentials.set("local-viewer@example.local", body.newPassword);
  empty(res, 204);
  return true;
}

export const handleAcceptInvite = exactRoute(
  "POST",
  "/api/identity/invites/accept",
  handleAcceptInviteResponse,
);

/** Validate the invite pin before creating viewer credentials. */
async function handleAcceptInviteResponse(context) {
  const { req, res } = context;

  const body = await readBody(req);
  if (body.token !== "e2e-invite-token") {
    json(res, 400, { error: "Invalid invite token" });
    return true;
  }
  mockState.credentials.set("invited@example.local", body.password);
  json(res, 200, {
    ...userForEmail("invited@example.local"),
    roles: ["viewer"],
  });
  return true;
}

export const handleChangePassword = exactRoute(
  "POST",
  "/api/identity/password/change",
  handleChangePasswordResponse,
);

/** Check the current user password before replacing its credential. */
async function handleChangePasswordResponse(context) {
  const { req, res } = context;

  const body = await readBody(req);
  if (
    mockState.credentials.get(mockState.currentUser.email) !==
    body.currentPassword
  ) {
    json(res, 400, { error: "Invalid current password" });
    return true;
  }
  mockState.credentials.set(mockState.currentUser.email, body.newPassword);
  empty(res, 204);
  return true;
}

export const handleStartEnrollment = exactRoute(
  "POST",
  "/api/identity/mfa/enroll/start",
  handleStartEnrollmentResponse,
);

/** Retain the exact OTP URI and lazily generated QR image. */
async function handleStartEnrollmentResponse(context) {
  const { res } = context;

  const otpauthUrl = `otpauth://totp/Constitution%20Atlas:e2e?secret=${MFA_TEST_SECRET}&issuer=Constitution%20Atlas`;
  json(res, 200, {
    secret: MFA_TEST_SECRET,
    otpauthUrl,
    qrDataUrl: await QRCode.toDataURL(otpauthUrl),
    challengeToken: "e2e-enroll-challenge",
  });
  return true;
}

export const handleConfirmEnrollment = exactRoute(
  "POST",
  "/api/identity/mfa/enroll/confirm",
  handleConfirmEnrollmentResponse,
);

/** Validate the code before enabling MFA and replacing recovery codes. */
async function handleConfirmEnrollmentResponse(context) {
  const { req, res } = context;

  const body = await readBody(req);
  if (![MFA_CODE, testTotp()].includes(body.code)) {
    json(res, 400, { error: "Invalid code" });
    return true;
  }
  mockState.enrolledMfaEmails.add(mockState.currentUser.email);
  mockState.currentUser = { ...mockState.currentUser, mfaEnabled: true };
  mockState.recoveryCodes.set(
    mockState.currentUser.email,
    new Set(["RECOVERY-ONE", "RECOVERY-TWO"]),
  );
  json(res, 200, {
    recoveryCodes: ["RECOVERY-ONE", "RECOVERY-TWO"],
    token: SESSION_TOKEN,
    expiresInSeconds: 86400,
    user: mockState.currentUser,
  });
  return true;
}

/** Replace recovery codes for the currently selected account. */
export function handleRegenerateRecovery(context) {
  const { pathname, method, res } = context;
  if (
    !(method === "POST" && pathname === "/api/identity/mfa/recovery/regenerate")
  )
    return false;
  mockState.recoveryCodes.set(
    mockState.currentUser.email,
    new Set(["RECOVERY-NEW"]),
  );
  json(res, 200, { recoveryCodes: ["RECOVERY-NEW"] });
  return true;
}

/** Expose the completed local HTTP setup status without authentication. */
export function handleSetupStatus(context) {
  const { pathname, method, res } = context;
  if (!(method === "GET" && pathname === "/api/identity/setup/status"))
    return false;
  return handledJson(res, 200, {
    completed: true,
    tlsMode: "local-http",
    publicUrl: "http://localhost",
  });
}

/** Expose the deterministic enabled-language policy without authentication. */
export function handleSiteLanguages(context) {
  const { pathname, method, res } = context;
  if (!(method === "GET" && pathname === "/api/identity/site/languages"))
    return false;
  return handledJson(res, 200, {
    supported: ["en", "de"],
    enabled: ["en", "de"],
    defaultLanguage: "en",
    managed: false,
  });
}

/** Require the exact fixture Bearer token before returning current identity. */
export function handleCurrentIdentity(context) {
  const { pathname, method, req, res } = context;
  if (!(method === "GET" && pathname === "/api/identity/me")) return false;
  if (bearer(req) !== SESSION_TOKEN) {
    json(res, 401, { error: "Unauthorized" });
    return true;
  }
  json(res, 200, mockState.currentUser);
  return true;
}

export const handleSetLanguage = exactRoute(
  "PUT",
  "/api/identity/me/language",
  handleSetLanguageResponse,
);

/** Authenticate before validating and storing language preference. */
async function handleSetLanguageResponse(context) {
  const { req, res } = context;

  if (bearer(req) !== SESSION_TOKEN) {
    json(res, 401, { error: "Unauthorized" });
    return true;
  }
  const { languagePreference } = await readBody(req);
  if (!["auto", "en", "de"].includes(languagePreference)) {
    json(res, 400, { error: "Unsupported language preference" });
    return true;
  }
  mockState.currentUser = { ...mockState.currentUser, languagePreference };
  json(res, 200, mockState.currentUser);
  return true;
}

/** Expose only whether the selected translation provider is enabled. */
export function handleTranslationAvailability(context) {
  const { pathname, method, res } = context;
  if (
    !(
      method === "GET" &&
      pathname === "/api/identity/content-translation/availability"
    )
  )
    return false;
  json(res, 200, { enabled: mockState.translationSite.provider !== "off" });
  return true;
}

/** Match the user translation gate before consuming request bytes or mutating state. */
export function handleUserTranslation(context) {
  const { req, pathname } = context;
  if (
    pathname === "/api/identity/content-translation/me" &&
    bearer(req) === SESSION_TOKEN
  )
    return handleUserTranslationResponse(context);
  return false;
}

/** Retain authenticated translation preferences and key-presence updates. */
async function handleUserTranslationResponse(context) {
  const { req, res, method } = context;

  if (method === "GET") {
    json(res, 200, mockState.translationUser);
    return true;
  }
  if (method === "PUT") {
    const body = await readBody(req);
    mockState.translationUser = {
      alwaysTranslate: Boolean(body.alwaysTranslate),
      personalGoogleKeyConfigured: body.clearPersonalGoogleKey
        ? false
        : Boolean(body.personalGoogleKey) ||
          mockState.translationUser.personalGoogleKeyConfigured,
    };
    json(res, 200, mockState.translationUser);
    return true;
  }

  return false;
}

/** Match the site translation gate before consuming request bytes or mutating state. */
export function handleSiteTranslation(context) {
  const { req, pathname } = context;
  if (
    pathname === "/api/identity/content-translation/admin" &&
    bearer(req) === SESSION_TOKEN
  )
    return handleSiteTranslationResponse(context);
  return false;
}

/** Retain authenticated shared provider/key updates and usage counters. */
async function handleSiteTranslationResponse(context) {
  const { req, res, method } = context;

  if (method === "GET") {
    json(res, 200, mockState.translationSite);
    return true;
  }
  if (method === "PUT") {
    const body = await readBody(req);
    mockState.translationSite = {
      ...mockState.translationSite,
      provider: body.provider,
      sharedKeyConfigured: body.clearSharedApiKey
        ? false
        : Boolean(body.sharedApiKey) ||
          mockState.translationSite.sharedKeyConfigured,
    };
    json(res, 200, mockState.translationSite);
    return true;
  }

  return false;
}

/** Match the translate gate before consuming request bytes or mutating state. */
export function handleTranslate(context) {
  const { pathname, method } = context;
  if (
    method === "POST" &&
    [
      "/api/identity/content-translation/translate",
      "/api/identity/content-translation/translate-batch",
    ].includes(pathname)
  )
    return handleTranslateResponse(context);
  return false;
}

/** Preserve login/provider/body precedence, character accounting and response shape. */
async function handleTranslateResponse(context) {
  const { req, res } = context;

  if (bearer(req) !== SESSION_TOKEN) {
    json(res, 401, { error: "Login required" });
    return true;
  }
  if (mockState.translationSite.provider === "off") {
    json(res, 403, { error: "Translation disabled" });
    return true;
  }
  const body = await readBody(req);
  const texts = body.texts ?? [body.text];
  mockState.translationSite.sharedGoogleCharactersUsed += texts.reduce(
    (sum, text) => sum + String(text ?? "").length,
    0,
  );
  const translated = texts.map((text) => `[${body.targetLanguage}] ${text}`);
  json(
    res,
    200,
    body.texts
      ? {
          texts: translated,
          provider: mockState.translationUser.personalGoogleKeyConfigured
            ? "google"
            : mockState.translationSite.provider,
        }
      : {
          text: translated[0],
          provider: mockState.translationUser.personalGoogleKeyConfigured
            ? "google"
            : mockState.translationSite.provider,
        },
  );
  return true;
}

/** Project disabled browsing as zero quotas without mutating stored limits. */
export function handleAnonymousPolicy(context) {
  const { pathname, method, res } = context;
  if (!(method === "GET" && pathname === "/api/identity/anonymous-browsing"))
    return false;
  json(
    res,
    200,
    mockState.anonymousBrowsing.allowed
      ? mockState.anonymousBrowsing
      : {
          ...mockState.anonymousBrowsing,
          perIp: { ...mockState.anonymousBrowsing.perIp, requests: 0 },
          total: { ...mockState.anonymousBrowsing.total, requests: 0 },
        },
  );
  return true;
}

/** Expose the current public Swagger visibility setting. */
export function handleSwaggerAccess(context) {
  const { pathname, method, res } = context;
  if (!(method === "GET" && pathname === "/api/identity/swagger-access"))
    return false;
  json(res, 200, mockState.swaggerAccess);
  return true;
}

/** Match the admin swagger gate before consuming request bytes or mutating state. */
export function handleAdminSwagger(context) {
  const { pathname } = context;
  if (pathname === "/api/identity/admin/swagger-access")
    return handleAdminSwaggerResponse(context);
  return false;
}

/** Retain credential, admin, method, freshness and boolean-validation order. */
async function handleAdminSwaggerResponse(context) {
  const { req, res, method } = context;

  if (bearer(req) !== SESSION_TOKEN) {
    json(res, 401, { error: "Unauthorized" });
    return true;
  }
  if (!mockState.currentUser.roles.includes("admin")) {
    json(res, 403, { error: "Forbidden" });
    return true;
  }
  if (method === "GET") {
    json(res, 200, mockState.swaggerAccess);
    return true;
  }
  if (method === "PUT") {
    if (!mockState.stepUpFresh) {
      json(res, 403, { code: "step_up_required" });
      return true;
    }
    const body = await readBody(req);
    if (typeof body.enabled !== "boolean") {
      json(res, 400, { error: "Invalid setting" });
      return true;
    }
    mockState.swaggerAccess = { enabled: body.enabled };
    json(res, 200, mockState.swaggerAccess);
    return true;
  }

  return false;
}

/** Match the admin browsing gate before consuming request bytes or mutating state. */
export function handleAdminBrowsing(context) {
  const { req, pathname } = context;
  if (
    pathname === "/api/identity/admin/anonymous-browsing" &&
    bearer(req) === SESSION_TOKEN
  )
    return handleAdminBrowsingResponse(context);
  return false;
}

/** Retain authenticated policy reads and freshness checks before revision changes. */
async function handleAdminBrowsingResponse(context) {
  const { req, res, method } = context;

  if (method === "GET") {
    json(res, 200, mockState.anonymousBrowsing);
    return true;
  }
  if (method === "PUT") {
    if (!mockState.stepUpFresh) {
      json(res, 403, {
        error: "Fresh authentication required",
        code: "step_up_required",
      });
      return true;
    }
    mockState.anonymousBrowsing = {
      ...(await readBody(req)),
      revision: mockState.anonymousBrowsing.revision + 1,
    };
    json(res, 200, mockState.anonymousBrowsing);
    return true;
  }

  return false;
}

/** Authenticate before combining current and managed account projections. */
export function handleUsers(context) {
  const { pathname, method, req, res } = context;
  if (!(method === "GET" && pathname === "/api/identity/users")) return false;
  if (bearer(req) !== SESSION_TOKEN) {
    json(res, 401, { error: "Unauthorized" });
    return true;
  }
  json(res, 200, [
    {
      id: mockState.currentUser.id,
      email: mockState.currentUser.email,
      roles: mockState.currentUser.roles,
      enabled: mockState.currentUser.enabled !== false,
      status:
        mockState.currentUser.status ??
        (mockState.currentUser.enabled === false ? "disabled" : "active"),
      createdAt: "2026-01-01T00:00:00Z",
    },
    ...mockState.managedUsers,
  ]);
  return true;
}

export const handleInviteUser = exactRoute(
  "POST",
  "/api/identity/users/invites",
  handleInviteUserResponse,
);

/** Append deterministic managed invitations without changing caller role behavior. */
async function handleInviteUserResponse(context) {
  const { req, res } = context;

  const body = await readBody(req);
  const user = {
    id: `managed-${mockState.managedUsers.length + 1}`,
    email: body.email,
    roles: body.roles,
    enabled: true,
    status: "invited",
    createdAt: "2026-01-02T00:00:00Z",
  };
  mockState.managedUsers.push(user);
  json(res, 201, { user, inviteToken: "E2E-INVITE-ADMIN" });
  return true;
}

/** Match the manage user gate before consuming request bytes or mutating state. */
export function handleManageUser(context) {
  const { method, pathname } = context;
  const managedUserMatch = pathname.match(
    /^\/api\/identity\/users\/([^/]+)\/(disable|enable|roles|password-resets)$/,
  );
  if (managedUserMatch && (method === "POST" || method === "PUT"))
    return handleManageUserResponse(context, managedUserMatch);
  return false;
}

/** Preserve current-user alias handling and action-specific body consumption. */
async function handleManageUserResponse(context, managedUserMatch) {
  const { req, res } = context;

  const isCurrentUser = managedUserMatch[1] === mockState.currentUser.id;
  const user = (isCurrentUser
    ? mockState.currentUser
    : mockState.managedUsers.find(
        (item) => item.id === managedUserMatch[1],
      )) ?? {
    id: managedUserMatch[1],
    email: "managed@example.local",
    roles: ["viewer"],
    enabled: true,
    status: "active",
    createdAt: "2026-01-02T00:00:00Z",
  };
  if (!isCurrentUser && !mockState.managedUsers.includes(user))
    mockState.managedUsers.push(user);
  if (managedUserMatch[2] === "disable") {
    user.enabled = false;
    user.status = "disabled";
  }
  if (managedUserMatch[2] === "enable") {
    user.enabled = true;
    user.status = "active";
  }
  if (managedUserMatch[2] === "roles") user.roles = (await readBody(req)).roles;
  if (isCurrentUser)
    mockState.currentUser = { ...mockState.currentUser, roles: user.roles };
  if (managedUserMatch[2] === "password-resets") {
    json(res, 201, { resetToken: "E2E-RESET-ADMIN" });
    return true;
  }
  json(res, 200, user);
  return true;
}

/** Return the current mutable service-token collection. */
export function handleServiceTokens(context) {
  const { pathname, method, res } = context;
  if (!(method === "GET" && pathname === "/api/identity/service-tokens"))
    return false;
  json(res, 200, mockState.serviceTokens);
  return true;
}

export const handleCreateServiceToken = exactRoute(
  "POST",
  "/api/identity/service-tokens",
  handleCreateServiceTokenResponse,
);

/** Append deterministic service tokens and expose the secret only in creation output. */
async function handleCreateServiceTokenResponse(context) {
  const { req, res } = context;

  const body = await readBody(req);
  const created = {
    id: `service-token-${mockState.serviceTokens.length + 1}`,
    name: body.name,
    scopes: body.scopes,
    createdAt: "2026-01-02T00:00:00Z",
    expiresAt: "2026-04-02T00:00:00Z",
    revokedAt: null,
  };
  mockState.serviceTokens.push(created);
  json(res, 201, { ...created, token: "E2E-SERVICE-TOKEN" });
  return true;
}

/** Preserve the original missing-token spread behavior during rotation. */
export function handleRotateServiceToken(context) {
  const { method, pathname, res } = context;
  const serviceTokenMatch = pathname.match(
    /^\/api\/identity\/service-tokens\/([^/]+)(\/rotate)?$/,
  );
  if (!(serviceTokenMatch && method === "POST" && serviceTokenMatch[2]))
    return false;
  const token = mockState.serviceTokens.find(
    (item) => item.id === serviceTokenMatch[1],
  );
  json(res, 200, { ...token, token: "E2E-ROTATED-TOKEN" });
  return true;
}

/** Mark an existing token revoked while retaining the unconditional no-content response. */
export function handleDeleteServiceToken(context) {
  const { method, pathname, res } = context;
  const serviceTokenMatch = pathname.match(
    /^\/api\/identity\/service-tokens\/([^/]+)(\/rotate)?$/,
  );
  if (!(serviceTokenMatch && method === "DELETE")) return false;
  const token = mockState.serviceTokens.find(
    (item) => item.id === serviceTokenMatch[1],
  );
  if (token) token.revokedAt = "2026-01-03T00:00:00Z";
  empty(res, 204);
  return true;
}

/** Retain the no-content logout response without resetting fixture state. */
export function handleLogout(context) {
  const { pathname, method, res } = context;
  if (!(method === "POST" && pathname === "/api/identity/logout")) return false;
  empty(res, 204);
  return true;
}

export const handleStepUp = exactRoute(
  "POST",
  "/api/identity/mfa/step-up",
  handleStepUpResponse,
);

/** Validate token and code before synchronizing freshness projections. */
async function handleStepUpResponse(context) {
  const { req, res } = context;

  const body = await readBody(req);
  if (bearer(req) !== SESSION_TOKEN || body.code !== MFA_CODE) {
    json(res, 401, { error: "Unable to confirm step-up authentication" });
    return true;
  }
  mockState.stepUpFresh = true;
  mockState.currentUser = { ...mockState.currentUser, stepUpFresh: true };
  empty(res, 204);
  return true;
}
