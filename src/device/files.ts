import * as FileSystem from "expo-file-system/legacy";
import type { TextFileReader } from "../core/files";

/**
 * TextFileReader over expo-file-system. The `/legacy` entry point is
 * deliberate: expo-file-system v19 (SDK 54) replaced the classic
 * readAsStringAsync API with a File/Directory class model, and `/legacy`
 * is where the old API still lives. Importing bare `expo-file-system`
 * here won't typecheck.
 */
export const deviceFileReader: TextFileReader = {
  read(path: string): Promise<string> {
    return FileSystem.readAsStringAsync(path);
  },
};
