export type BoundaryDirection = "north" | "south" | "east" | "west";

export interface BoundaryCarveOut {
  neighborhood: string;
  street: string;
  direction: BoundaryDirection;
}

export interface VillageRule {
  village: string;
  wholeNeighborhoods: Set<string>;
  carveOuts: BoundaryCarveOut[];
}

const DIRECTION_BY_CHARACTER: Record<string, BoundaryDirection> = {
  北: "north",
  南: "south",
  東: "east",
  西: "west",
};

const VILLAGE_BLOCK_PATTERN = /([^\s（）、]+里)(?:（([^）]*)）)?/g;
const CARVE_OUT_CLAUSE_PATTERN = /^第(\d+)鄰(.+?)以([南北東西])$/;
const NEIGHBORHOOD_LIST_CLAUSE_PATTERN = /^第(.+)鄰$/;

function padNeighborhood(n: number): string {
  return String(n).padStart(3, "0");
}

function expandNeighborhoodNumbers(list: string): string[] {
  const result: string[] = [];
  for (const token of list.split(/[、,]/)) {
    const rangeMatch = token.match(/^(\d+)[-~](\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      for (let n = start; n <= end; n++) {
        result.push(padNeighborhood(n));
      }
    } else if (/^\d+$/.test(token)) {
      result.push(padNeighborhood(Number(token)));
    }
    // anything else (e.g. stray punctuation) is silently ignored — it's
    // not a recognizable neighborhood number, not a parse error.
  }
  return result;
}

/**
 * Parses a raw 學區範圍_里鄰 cell (e.g. "干城里（第6、12、20鄰及第7鄰福智街以南）")
 * into per-village rules. Per ADR-0010, this only recognizes two clause
 * shapes, joined by "及": a plain neighborhood number/range list, and a
 * single-street 以南/以北/以東/以西 carve-out. Any clause that doesn't match
 * either shape is silently dropped from the rule (not thrown as an error) —
 * SchoolDistrictLookup treats an address that falls into a dropped clause
 * the same as one with no matching rule at all: needs-manual-review.
 */
export function parseSchoolDistrictText(text: string): VillageRule[] {
  const rules: VillageRule[] = [];

  for (const blockMatch of text.matchAll(VILLAGE_BLOCK_PATTERN)) {
    const village = blockMatch[1] ?? "";
    if (!village) continue;
    const content = blockMatch[2] ?? "";
    const wholeNeighborhoods = new Set<string>();
    const carveOuts: BoundaryCarveOut[] = [];

    for (const rawClause of content.split("及")) {
      const clause = rawClause.trim();
      if (!clause) continue;

      const carveMatch = clause.match(CARVE_OUT_CLAUSE_PATTERN);
      if (carveMatch) {
        const [, neighborhood, street, directionChar] = carveMatch;
        const direction = directionChar ? DIRECTION_BY_CHARACTER[directionChar] : undefined;
        if (neighborhood && street && direction) {
          carveOuts.push({ neighborhood: padNeighborhood(Number(neighborhood)), street, direction });
        }
        continue;
      }

      const listMatch = clause.match(NEIGHBORHOOD_LIST_CLAUSE_PATTERN);
      if (listMatch?.[1]) {
        for (const neighborhood of expandNeighborhoodNumbers(listMatch[1])) {
          wholeNeighborhoods.add(neighborhood);
        }
      }
    }

    rules.push({ village, wholeNeighborhoods, carveOuts });
  }

  return rules;
}
