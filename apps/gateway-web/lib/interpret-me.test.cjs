const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { interpretMeResponse } = require('./interpret-me');

describe('interpretMeResponse', () => {
  it('treats network failures as signed-out without clearing the cookie', () => {
    assert.deepEqual(interpretMeResponse({ networkError: true, status: null }), {
      signedOut: true,
      clearCookie: false,
    });
  });

  it('clears the cookie on 401', () => {
    assert.deepEqual(interpretMeResponse({ networkError: false, status: 401 }), {
      signedOut: true,
      clearCookie: true,
    });
  });

  it('treats 5xx as signed-out without clearing the cookie', () => {
    assert.deepEqual(interpretMeResponse({ networkError: false, status: 503 }), {
      signedOut: true,
      clearCookie: false,
    });
  });

  it('keeps a 200 response as signed-in', () => {
    assert.deepEqual(interpretMeResponse({ networkError: false, status: 200 }), {
      signedOut: false,
      clearCookie: false,
    });
  });
});
