import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMessaging } from "../src/messaging/create.js";

describe("createMessaging", () => {
  it("defaults to waha when unset", () => {
    const m = createMessaging({ WAHA_SESSION: "JJ" });
    assert.equal(m.name, "waha");
  });

  it("waha without session throws waha_session_missing", () => {
    assert.throws(
      () => createMessaging({}),
      (err) => err && err.code === "waha_session_missing",
    );
  });

  it("meta without token throws meta_config_missing", () => {
    assert.throws(
      () => createMessaging({ WHATSAPP_PROVIDER: "meta" }),
      (err) => err && err.code === "meta_config_missing",
    );
  });

  it("meta with four env vars builds meta adapter", () => {
    const m = createMessaging({
      WHATSAPP_PROVIDER: "META",
      META_PHONE_NUMBER_ID: "1",
      META_ACCESS_TOKEN: "t",
      META_VERIFY_TOKEN: "v",
      META_APP_SECRET: "s",
    });
    assert.equal(m.name, "meta");
  });

  it("unknown provider throws messaging_provider_unknown", () => {
    assert.throws(
      () => createMessaging({ WHATSAPP_PROVIDER: "telegram" }),
      (err) => err && err.code === "messaging_provider_unknown",
    );
  });
});
