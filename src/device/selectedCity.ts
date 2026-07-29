// Remembers which 縣市 the user last looked at, so relaunching doesn't
// silently drop them back to the default city — and, more importantly,
// doesn't kick off a fresh ~200MB sync for a city they weren't using.
//
// A one-key JSON file rather than a dependency on AsyncStorage: the app
// already writes its data-versions file this way, and this is the only
// preference there is.
import * as FileSystem from "expo-file-system/legacy";
import { DEFAULT_CITY_ID, isCityId, type CityId } from "../core/cities";

const SETTINGS_FILE_PATH = `${FileSystem.documentDirectory}selected-city.json`;

export async function readSelectedCityId(): Promise<CityId> {
  try {
    const info = await FileSystem.getInfoAsync(SETTINGS_FILE_PATH);
    if (!info.exists) {
      return DEFAULT_CITY_ID;
    }
    const { cityId } = JSON.parse(await FileSystem.readAsStringAsync(SETTINGS_FILE_PATH)) as { cityId?: string };
    // A city dropped from a later build leaves a stale id behind; falling
    // back beats failing to start.
    return cityId && isCityId(cityId) ? cityId : DEFAULT_CITY_ID;
  } catch {
    return DEFAULT_CITY_ID;
  }
}

export async function writeSelectedCityId(cityId: CityId): Promise<void> {
  await FileSystem.writeAsStringAsync(SETTINGS_FILE_PATH, JSON.stringify({ cityId }));
}
