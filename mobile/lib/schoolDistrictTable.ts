// Mirrors ../../src/school-district/SchoolDistrictTable.ts — duplicated
// because Metro doesn't bundle files outside this app's root. Pure regex
// parsing, no Node APIs, so it's a verbatim copy.
export type BoundaryDirection = "north" | "south" | "east" | "west";

export interface BoundaryCarveOut {
  neighborhood: string;
  street: string;
  direction: BoundaryDirection;
}

export interface VillageRule {
  village: string;
  wholeVillage: boolean;
  wholeNeighborhoods: Set<string>;
  carveOuts: BoundaryCarveOut[];
}

const DIRECTION_BY_CHARACTER: Record<string, BoundaryDirection> = {
  北: "north",
  南: "south",
  東: "east",
  西: "west",
};

const VILLAGE_BLOCK_PATTERN = /([^\s（）()、]+里)(?:[（(]([^）)]*)[）)])?/g;
const CARVE_OUT_CLAUSE_PATTERN = /^第(\d+)鄰(.+?)以([南北東西])$/;
const NEIGHBORHOOD_LIST_CLAUSE_PATTERN = /^第(.+)鄰$/;
const WHOLE_VILLAGE_CLAUSE = "全里";

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
  }
  return result;
}

export function parseSchoolDistrictText(text: string): VillageRule[] {
  const rules: VillageRule[] = [];

  for (const blockMatch of text.matchAll(VILLAGE_BLOCK_PATTERN)) {
    const village = blockMatch[1] ?? "";
    if (!village) continue;
    const content = blockMatch[2] ?? "";
    let wholeVillage = false;
    const wholeNeighborhoods = new Set<string>();
    const carveOuts: BoundaryCarveOut[] = [];

    for (const rawClause of content.split("及")) {
      const clause = rawClause.trim();
      if (!clause) continue;

      if (clause === WHOLE_VILLAGE_CLAUSE) {
        wholeVillage = true;
        continue;
      }

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

    rules.push({ village, wholeVillage, wholeNeighborhoods, carveOuts });
  }

  return rules;
}
