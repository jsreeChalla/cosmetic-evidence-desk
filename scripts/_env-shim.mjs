// Only shim what's actually missing — Node 18+ already provides real,
// functional globals. Overwriting a working Headers/Request/Response with an
// empty stub class breaks the AI SDK internals that call real methods on them
// (e.g. `TypeError: normalizedHeaders.get is not a function`).
//
// Imported for its side effect only — shared by any standalone script that
// loads research.server.ts's bundle outside the app's own server runtime.
if (typeof globalThis.TransformStream === 'undefined') globalThis.TransformStream = class TransformStream {};
if (typeof globalThis.Headers === 'undefined') globalThis.Headers = class Headers {};
if (typeof globalThis.Request === 'undefined') globalThis.Request = class Request {};
if (typeof globalThis.Response === 'undefined') globalThis.Response = class Response {};
