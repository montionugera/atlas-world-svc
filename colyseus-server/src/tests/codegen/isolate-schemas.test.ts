import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { isolateSchemas } from '../../codegen/isolate-schemas'

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'iso-'))
}

describe('isolateSchemas', () => {
  it('strips runtime imports/methods, keeps @type fields in order, rewires schema imports', () => {
    const inDir = tmp()
    const outDir = tmp()
    // A fat class like Mob: runtime imports + methods + non-@type fields
    fs.writeFileSync(
      path.join(inDir, 'Base.ts'),
      `import { Schema, type } from '@colyseus/schema'\n` +
        `export class Base extends Schema {\n` +
        `  @type('string') id: string = ''\n` +
        `}\n`
    )
    fs.writeFileSync(
      path.join(inDir, 'Fat.ts'),
      `import { type } from '@colyseus/schema'\n` +
        `import { Base } from './Base'\n` +
        `import { EventBus } from '../events/EventBus'\n` +
        `export class Fat extends Base {\n` +
        `  @type('string') tag: string = ''\n` +
        `  combatSystem: EventBus\n` +
        `  @type('number') speed: number = 5\n` +
        `  update(): void { this.combatSystem.emit() }\n` +
        `}\n`
    )

    const written = isolateSchemas(inDir, outDir)

    const fat = fs.readFileSync(path.join(outDir, 'Fat.ts'), 'utf8')
    // keeps @type fields in order
    expect(fat.indexOf('tag')).toBeLessThan(fat.indexOf('speed'))
    // drops runtime import + non-@type field + method
    expect(fat).not.toContain('EventBus')
    expect(fat).not.toContain('combatSystem')
    expect(fat).not.toContain('update()')
    // keeps schema import rewired to sibling
    expect(fat).toContain(`import { Base } from './Base'`)
    expect(fat).toContain('extends Base')
    expect(written.map(p => path.basename(p)).sort()).toEqual(['Base.ts', 'Fat.ts'])
  })
})
