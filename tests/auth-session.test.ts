import assert from "node:assert/strict";
import test from "node:test";
import { createSession, verifyGoogleCredential, verifySession } from "../lib/auth-session.ts";

test("creates, verifies and expires signed sessions", async () => {
  const now = Date.parse("2026-08-21T12:00:00Z");
  const user = { userId: "user@example.com", email: "user@example.com", displayName: "User" };
  const session = await createSession(user, "a sufficiently long session secret", now);
  assert.deepEqual(await verifySession(session, "a sufficiently long session secret", now + 1000), user);
  assert.equal(await verifySession(`${session}x`, "a sufficiently long session secret", now + 1000), null);
  assert.equal(await verifySession(session, "a sufficiently long session secret", now + 8 * 24 * 60 * 60 * 1000), null);
});

test("verifies a Google RS256 credential and required identity claims", async () => {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
  publicKey.kid = "test-key";
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", kid: "test-key" });
  const claims = encode({ iss: "https://accounts.google.com", aud: "client-id", sub: "google-user", email: "User@Example.com", email_verified: true, name: "Test User", exp: Math.floor(Date.now() / 1000) + 300 });
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${header}.${claims}`));
  const credential = `${header}.${claims}.${Buffer.from(signature).toString("base64url")}`;
  const user = await verifyGoogleCredential(credential, "client-id", async () => Response.json({ keys: [publicKey] }, { headers: { "cache-control": "max-age=60" } }));
  assert.deepEqual(user, { userId: "user@example.com", email: "user@example.com", displayName: "Test User" });
  await assert.rejects(() => verifyGoogleCredential(credential, "wrong-client", async () => Response.json({ keys: [publicKey] })), /verification failed/);
});
