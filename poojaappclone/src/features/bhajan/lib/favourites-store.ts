import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseIds } from './favourites';

/** Per account, so a shared phone does not mix two devotees' favourites. */
const key = (uid: string) => `bhakti.bhajan.favourites.${uid}`;

export const loadFavourites = async (uid: string) => parseIds(await AsyncStorage.getItem(key(uid)));
export const saveFavourites = (uid: string, ids: string[]) =>
  AsyncStorage.setItem(key(uid), JSON.stringify(ids));
