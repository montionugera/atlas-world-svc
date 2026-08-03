import { Project, ClassDeclaration, PropertyDeclaration, SyntaxKind } from 'ts-morph'
import * as fs from 'fs'
import * as path from 'path'

function hasTypeDecorator(prop: PropertyDeclaration): boolean {
  return prop.getDecorators().some(d => d.getName() === 'type')
}

// Collect identifiers referenced inside the @type(...) decorator (class args like
// `@type(BattleStatus)` or `@type({ map: Player })`) so we can keep their imports.
function typeClassRefs(prop: PropertyDeclaration): string[] {
  const refs: string[] = []
  for (const d of prop.getDecorators()) {
    if (d.getName() !== 'type') continue
    d.getArguments().forEach(arg => {
      arg.getDescendantsOfKind(SyntaxKind.Identifier).forEach(id => {
        const t = id.getText()
        if (/^[A-Z]/.test(t)) refs.push(t) // PascalCase => a schema class
      })
    })
  }
  return refs
}

export function isolateSchemas(inputDir: string, outputDir: string): string[] {
  fs.mkdirSync(outputDir, { recursive: true })
  const project = new Project({ compilerOptions: { allowJs: false } })
  project.addSourceFilesAtPaths(path.join(inputDir, '*.ts'))

  // Names of all schema classes across the input (to know which imports to keep).
  const schemaClassNames = new Set<string>()
  for (const sf of project.getSourceFiles()) {
    sf.getClasses().forEach(c => {
      if (c.getExtends()) schemaClassNames.add(c.getName() || '')
    })
  }

  const written: string[] = []
  for (const sf of project.getSourceFiles()) {
    const classes = sf.getClasses().filter(c => c.getExtends())
    if (classes.length === 0) continue

    const keptSchemaImports = new Set<string>() // sibling schema class names to import
    // `view` is included because GameState's root collections carry @view() for
    // AOI filtering, and decorators are copied verbatim at :56-59. Omitting it
    // emits generated schema sources that reference an unimported `view`.
    const primitives = new Set<string>(['Schema', 'type', 'view'])
    const bodies: string[] = []

    for (const cls of classes) {
      const name = cls.getName()!
      const ext = cls.getExtends()?.getText()
      if (ext && schemaClassNames.has(ext)) keptSchemaImports.add(ext)

      const fieldLines: string[] = []
      for (const prop of cls.getProperties()) {
        if (!hasTypeDecorator(prop)) continue
        // Preserve the decorator + declaration, drop any initializer that references runtime.
        const decos = prop
          .getDecorators()
          .map(d => `@${d.getText().replace(/^@/, '')}`)
          .join(' ')
        const propName = prop.getName()
        const typeNode = prop.getTypeNode()?.getText()
        // Detect collection types to emit valid initializers/types.
        if (/ArraySchema|MapSchema/.test(typeNode || '')) {
          if (/ArraySchema/.test(typeNode!)) primitives.add('ArraySchema')
          if (/MapSchema/.test(typeNode!)) primitives.add('MapSchema')
        }
        typeClassRefs(prop).forEach(r => {
          if (schemaClassNames.has(r)) keptSchemaImports.add(r)
        })
        const typeStr = typeNode ? `: ${typeNode}` : ''
        fieldLines.push(`  ${decos} ${propName}${typeStr}`)
      }
      const extClause = ext ? ` extends ${ext}` : ''
      bodies.push(`export class ${name}${extClause} {\n${fieldLines.join('\n')}\n}`)
    }

    // Build imports: @colyseus/schema primitives + sibling schema classes (relative).
    const importLines: string[] = [
      `import { ${[...primitives].join(', ')} } from '@colyseus/schema'`,
    ]
    for (const dep of keptSchemaImports) {
      if (classes.some(c => c.getName() === dep)) continue // self
      importLines.push(`import { ${dep} } from './${dep}'`)
    }

    const outPath = path.join(outputDir, path.basename(sf.getFilePath()))
    fs.writeFileSync(outPath, `${importLines.join('\n')}\n\n${bodies.join('\n\n')}\n`)
    written.push(outPath)
  }
  return written.sort()
}
