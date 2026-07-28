// Mirrors PropertyCard from ../src/property-query/PropertyQueryService.ts.
// Duplicated (not imported) because Metro doesn't bundle files outside this
// app's root, and this is a type-only POC glue point for a demo backend.
export type SchoolDistrictFieldResult =
  | { status: 'found'; schoolName: string }
  | { status: 'needs-manual-review' }
  | { status: 'address-not-in-registry' };

interface SchoolDistrictFields {
  elementarySchoolDistrict: SchoolDistrictFieldResult;
  juniorHighSchoolDistrict: SchoolDistrictFieldResult;
}

export type PropertyCard =
  | ({ status: 'ok'; zoneName: string; averagePrice: number; sampleCount: number } & SchoolDistrictFields)
  | ({
      status: 'insufficient-sample';
      zoneName: string;
      sampleCount: number;
      transactions: Array<{ address: string; transactionDate: string; price: number }>;
    } & SchoolDistrictFields)
  | { status: 'address-not-recognized' }
  | { status: 'outside-taichung' };
