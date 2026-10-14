import { describe, expect, it } from "vitest";
import { canReadChat, canSendChat } from "./chat";
import { NEXT_STATUS } from "@/features/orders/orders";

describe("chat rules", () => {
  it("is disabled while pending", () => expect(canReadChat("PENDING", null)).toBe(false));
  it("opens immediately on acceptance", () => expect(canSendChat("ACCEPTED", "r1")).toBe(true));
  it("is read-only after delivery", () => {
    expect(canReadChat("DELIVERED", "r1")).toBe(true);
    expect(canSendChat("DELIVERED", "r1")).toBe(false);
  });
});

describe("lifecycle", () => {
  it("advances one step at a time", () => {
    expect(NEXT_STATUS.ACCEPTED?.status).toBe("PICKED_UP");
    expect(NEXT_STATUS.PICKED_UP?.status).toBe("IN_TRANSIT");
    expect(NEXT_STATUS.IN_TRANSIT?.status).toBe("DELIVERED");
    expect(NEXT_STATUS.DELIVERED).toBeUndefined();
  });
});
