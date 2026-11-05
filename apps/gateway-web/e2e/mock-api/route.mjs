/**
 * Match one exact method/path without awaiting misses or consuming request bodies.
 * A selected response keeps its original context, return value and failure behavior.
 */
export function exactRoute(expectedMethod, expectedPath, response) {
  return (context) => {
    const { pathname, method } = context;
    return method === expectedMethod && pathname === expectedPath
      ? response(context)
      : false;
  };
}
