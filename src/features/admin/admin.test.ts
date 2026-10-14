import { describe, expect, it } from "vitest";
import { canChangePriority, filterOrders, type AdminOrder } from "./admin";

const o = (id: string, status: string, priority: string) => ({ id, status, priority }) as unknown as AdminOrder;

describe("priority rules", () => {
  it("blocks changes on delivered orders", () => expect(canChangePriority("DELIVERED")).toBe(false));
  it("allows changes on in-transit orders", () => expect(canChangePriority("IN_TRANSIT")).toBe(true));
});

describe("admin order filters", () => {
  const list = [o("abcd1234-x", "PENDING", "URGENT"), o("ffff0000-y", "DELIVERED", "NORMAL")];
  it("searches by reference", () => expect(filterOrders(list, { q: "#abcd", status: "ALL", priority: "ALL" })).toHaveLength(1));
  it("combines status and priority filters", () => {
    expect(filterOrders(list, { q: "", status: "PENDING", priority: "NORMAL" })).toHaveLength(0);
    expect(filterOrders(list, { q: "", status: "PENDING", priority: "URGENT" })).toHaveLength(1);
  });
});
