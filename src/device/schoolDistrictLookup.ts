// The shipping school-district lookup: tools/school-district/SchoolDistrictLookup.ts
// ported from node:fs.readFileSync to expo-file-system (RN has no
// node:fs). The clause-matching logic itself lives in
// ../core/schoolDistrictTable.ts and is shared with the pipeline; only
// this file's file-reading half is still duplicated — see tools/README.md.
import * as FileSystem from "expo-file-system/legacy";
import type { Coordinate } from "../core/geo";
import type { AddressPointStore } from "./db";
import { parseSchoolDistrictText, type BoundaryCarveOut } from "../core/schoolDistrictTable";

export interface SchoolDistrictRawRow {
  schoolName: string;
  villageNeighborhoodText: string;
}

export type SchoolDistrictMatch = { status: "found"; schoolName: string } | { status: "needs-manual-review" };

/**
 * 里/鄰 (+ coordinate, for carve-out resolution) -> school name, or
 * needs-manual-review when no rule covers the neighborhood outright and no
 * carve-out clause can be resolved (ADR-0010). Re-reads the table file on
 * every call, same as the server version — these files are small (tens of
 * KB), so re-parsing every query is cheap even on a phone, and per
 * ADR-0009 school-district judgments must never be cached across a data
 * refresh.
 */
export class JsonSchoolDistrictLookup {
  constructor(
    private readonly tableDataPath: string,
    private readonly addressPointStore: AddressPointStore,
  ) {}

  async match(village: string, neighborhood: string, coordinate: Coordinate): Promise<SchoolDistrictMatch> {
    const rows = await this.loadRows();

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

  private async loadRows(): Promise<SchoolDistrictRawRow[]> {
    const raw = await FileSystem.readAsStringAsync(this.tableDataPath);
    return JSON.parse(raw) as SchoolDistrictRawRow[];
  }
}
