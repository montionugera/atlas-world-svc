import * as fs from 'fs'
import * as path from 'path'

const PKG = path.resolve(__dirname, '../../../generated/csharp')

describe('UPM package shape', () => {
  it('has a valid package.json with no stray net6.0 csproj/obj', () => {
    const pj = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8'))
    expect(pj.name).toBe('com.atlasworld.contracts')
    expect(fs.existsSync(path.join(PKG, 'AtlasWorld.Contracts.asmdef'))).toBe(true)
    expect(fs.existsSync(path.join(PKG, 'AtlasWorld.Client.csproj'))).toBe(false)
    expect(fs.existsSync(path.join(PKG, 'obj'))).toBe(false)
    expect(fs.existsSync(path.join(PKG, 'AtlasWorldModels.cs'))).toBe(false)
  })
})
