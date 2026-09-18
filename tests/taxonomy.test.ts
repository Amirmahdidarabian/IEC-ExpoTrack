import { describe, expect, it } from "vitest";
import { normalizeTaxonomyName } from "@/lib/exhibitions/taxonomy";

describe("taxonomy normalization", () => {
  it("normalizes case, Unicode form and repeated whitespace", () => {
    expect(normalizeTaxonomyName("  Renewable   ENERGY ")).toBe("renewable energy");
    expect(normalizeTaxonomyName("Ｅnergy")).toBe("energy");
  });
});
