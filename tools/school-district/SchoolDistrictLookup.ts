import { readFileSync } from "node:fs";
import type { Coordinate } from "../../src/core/geo";
import type { AddressPointStore } from "../address-to-village/AddressPointStore";
import { parseSchoolDistrictText, type BoundaryCarveOut } from "../../src/core/schoolDistrictTable";

export interface SchoolDistrictRawRow {
  schoolName: string;
  villageNeighborhoodText: string;
}

export type SchoolDistrictMatch = { status: "found"; schoolName: string } | { status: "needs-manual-review" };

/**
 * 里/鄰 (+ coordinate, for carve-out resolution) -> school name, or
 * needs-manual-review when no rule covers the neighborhood outright and no
 * carve-out clause can be resolved (ADR-0010).
 */
export interface SchoolDistrictLookup {
  match(village: string, neighborhood: string, coordinate: Coordinate): SchoolDistrictMatch;
}

/**
 * Per ADR-0009, this implementation is intentionally never cached: the
 * school-district table file is re-read from disk on every call, same
 * reasoning as ZoneLookup not caching zone judgments — school-district
 * assignment is revised yearly, and a cached result would go silently
 * stale.
 */
export class JsonSchoolDistrictLookup implements SchoolDistrictLookup {
  constructor(
    private readonly tableDataPath: string,
    private readonly addressPointStore: AddressPointStore,
  ) {}

  match(village: string, neighborhood: string, coordinate: Coordinate): SchoolDistrictMatch {
    const rows = this.loadRows();

    for (const row of rows) {
      const rules = parseSchoolDistrictText(row.villageNeighborhoodText);
      for (const rule of rules) {
        if (rule.village !== village) continue;

        if (rule.wholeVillage || rule.wholeNeighborhoods.has(neighborhood)) {
          return { status: "found", schoolName: row.schoolName };
        }

        const carveOut = rule.carveOuts.find((c) => c.neighborhood === neighborhood);
        if (carveOut && this.isOnThisSide(coordinate, carveOut)) {
          return { status: "found", schoolName: row.schoolName };
        }
      }
    }

    return { status: "needs-manual-review" };
  }

  /**
   * Resolves a 以南/以北/以東/以西 carve-out by comparing the address's
   * coordinate against the nearest door plate on the clause's reference
   * street (reusing the same 門牌 dataset ticket 01 already loaded — no
   * separate street-geometry source exists). Returns false, not
   * needs-manual-review, when the reference street can't be located at
   * all: that just means this particular clause doesn't apply here, and
   * the caller keeps scanning other rows for the side that does.
   */
  private isOnThisSide(coordinate: Coordinate, carveOut: BoundaryCarveOut): boolean {
    const referencePoint = this.addressPointStore.findNearestOnStreet(coordinate, carveOut.street);
    if (!referencePoint) {
      return false;
    }

    switch (carveOut.direction) {
      case "north":
        return coordinate.lat > referencePoint.lat;
      case "south":
        return coordinate.lat < referencePoint.lat;
      case "east":
        return coordinate.lon > referencePoint.lon;
      case "west":
        return coordinate.lon < referencePoint.lon;
    }
  }

  private loadRows(): SchoolDistrictRawRow[] {
    const raw = readFileSync(this.tableDataPath, "utf-8");
    return JSON.parse(raw) as SchoolDistrictRawRow[];
  }
}
