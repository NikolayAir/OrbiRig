import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LINKS } from "./workflowContent";

const REPOSITORY = "https://github.com/NikolayAir/OrbiRig";
const repositoryFile = (path: string) => readFileSync(resolve(process.cwd(), "..", path), "utf8");

// Match GitHub's heading anchors for the plain headings these documents use.
function headingAnchors(markdown: string): string[] {
  return [...markdown.matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) => (
    heading.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-")
  ));
}

describe("documentation links", () => {
  it.each(Object.entries(LINKS).filter(([name]) => name !== "source"))("%s points to an existing page and heading", (_, link) => {
    const url = new URL(link);
    const path = url.pathname.replace("/NikolayAir/OrbiRig", "").replace("/blob/main/", "") || "README.md";
    expect(`${url.origin}/NikolayAir/OrbiRig`).toBe(REPOSITORY);
    const markdown = repositoryFile(path);
    if (url.hash) expect(headingAnchors(markdown)).toContain(url.hash.slice(1));
  });
});
