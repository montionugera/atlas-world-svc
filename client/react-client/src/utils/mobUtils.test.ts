import { readFileSync } from 'fs';
import { resolve } from 'path';
import bestiaryNames from '../data/bestiaryNames.json';
import { getMobDisplayName } from './mobUtils';

describe('getMobDisplayName', () => {
  it('src/data/bestiaryNames.json matches content/bestiary/bestiary.json (run scripts/gen-bestiary-names.mjs)', () => {
    const source = JSON.parse(
      readFileSync(resolve(__dirname, '../../../../content/bestiary/bestiary.json'), 'utf8')
    ) as { id: string; name: string }[];
    expect(bestiaryNames).toEqual(Object.fromEntries(source.map((e) => [e.id, e.name])));
  });

  it('keeps legacy Colyseus type names and the Unknown Mob fallback', () => {
    expect(getMobDisplayName({ mobTypeId: 'spear_thrower' })).toBe('Spear Thrower');
    expect(getMobDisplayName({})).toBe('Unknown Mob');
  });
});
