/**
 * The file-reading seam. The zoning GeoJSON and the 學區 tables are plain
 * text files that ship as data, read on the phone through expo-file-system
 * and on a computer through node:fs. Async because RN's file API is.
 */
export interface TextFileReader {
  read(path: string): Promise<string>;
}
