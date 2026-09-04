function interpretMeResponse(input) {
  const networkError = Boolean(input && input.networkError);
  const status = input && input.status;
  if (networkError || status == null) {
    return { signedOut: true, clearCookie: false };
  }
  if (status === 401) {
    return { signedOut: true, clearCookie: true };
  }
  if (status < 200 || status >= 300) {
    return { signedOut: true, clearCookie: false };
  }
  return { signedOut: false, clearCookie: false };
}

module.exports = { interpretMeResponse };
