/** chadhava module — listings, categories and paid orders. See docs/POOJA_AND_HOME.md §4. */
import { chadhavaRouters } from './chadhava.routes.js';
import { Offering } from './chadhava.model.js';

export { ChadhavaCategory, ChadhavaListing, ChadhavaOrder, Offering } from './chadhava.model.js';

export const routers = (deps) => chadhavaRouters(deps);

/** Seed the three starter offerings only into an empty catalogue, so a deleted one stays deleted. */
export async function seed() {
  if ((await Offering.countDocuments()) > 0) return;
  await Offering.insertMany([
    { key: 'flowers', name: 'Flowers', nameHi: 'फूल', coins: 11, order: 0 },
    { key: 'prasad', name: 'Prasad', nameHi: 'प्रसाद', coins: 5, order: 1 },
    { key: 'vastram', name: 'Vastram', nameHi: 'वस्त्रम्', coins: 10, order: 2 },
  ]);
}
