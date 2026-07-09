/**
 * Generates C# DTOs from the plain TS interfaces in contracts/src/meta/types.ts
 * (ProfileDoc, InventoryDoc, EquipmentDoc, SkillsDoc, QuestsDoc, MatchEvent,
 * MatchEventBatch, LoadoutSnapshot, PrimaryStats) plus the MatchEventType union
 * as a C# enum.
 *
 * This is a standalone sibling to src/codegen/isolate-schemas.ts (which handles
 * @colyseus/schema classes via the official schema-codegen tool). Plain TS
 * interfaces have no such tool, so this walks the interface declarations with
 * ts-morph directly and emits records — reading straight from the contracts
 * source, so output can never drift from hand-copied field lists.
 *
 * Lives under colyseus-server/scripts/ (not src/) by design for this task.
 */
import { Project, InterfaceDeclaration, PropertySignature, TypeNode, SyntaxKind } from 'ts-morph'

const INTERFACE_ORDER = [
  'PrimaryStats',
  'ProfileDoc',
  'InventoryDoc',
  'EquipmentDoc',
  'SkillsDoc',
  'QuestsDoc',
  'MatchEvent',
  'MatchEventBatch',
  'LoadoutSnapshot',
]

const NAMESPACE = 'AtlasWorld.Contracts.Meta'

function pascal(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

interface EmitCtx {
  extraTypes: Map<string, string> // name -> C# class/enum body (emitted once)
  enumNames: Set<string> // names of type aliases resolved to C# enums
}

/** Maps a TS property type node to a C# type, emitting nested/anon types into ctx as needed. */
function csharpType(typeNode: TypeNode | undefined, ownerName: string, propName: string, ctx: EmitCtx): string {
  if (!typeNode) return 'object'

  switch (typeNode.getKind()) {
    case SyntaxKind.StringKeyword:
      return 'string'
    case SyntaxKind.NumberKeyword:
      return 'double'
    case SyntaxKind.BooleanKeyword:
      return 'bool'
    case SyntaxKind.LiteralType: {
      // Numeric literal (e.g. schemaVersion: 1) — treat as int constant field.
      const text = typeNode.getText()
      if (/^\d+$/.test(text)) return 'int'
      return 'string'
    }
    case SyntaxKind.ArrayType: {
      const elementNode = typeNode.asKindOrThrow(SyntaxKind.ArrayType).getElementTypeNode()
      const elementName = /s$/.test(propName) ? propName.slice(0, -1) : propName
      const elCs = csharpType(elementNode, ownerName, `${elementName}Item`, ctx)
      return `List<${elCs}>`
    }
    case SyntaxKind.TypeReference: {
      const ref = typeNode.asKindOrThrow(SyntaxKind.TypeReference)
      const typeName = ref.getTypeName().getText()
      if (typeName === 'Record') {
        const args = ref.getTypeArguments()
        const valueCs = csharpType(args[1], ownerName, propName, ctx)
        return `Dictionary<string, ${valueCs}>`
      }
      // Reference to another local interface/type alias (e.g. PrimaryStats, MatchEventType).
      return typeName
    }
    case SyntaxKind.TypeLiteral: {
      // Anonymous inline object type — synthesize a named nested record.
      const literal = typeNode.asKindOrThrow(SyntaxKind.TypeLiteral)
      const className = `${ownerName}_${pascal(propName)}`
      if (!ctx.extraTypes.has(className)) {
        ctx.extraTypes.set(className, '') // reserve to avoid infinite recursion on self-reference
        const fields = literal.getProperties().map((p) => emitField(p, className, ctx))
        ctx.extraTypes.set(
          className,
          `    public sealed class ${className} {\n${fields.join('\n')}\n    }`,
        )
      }
      return className
    }
    default:
      return 'object'
  }
}

// C# reserved keywords that would otherwise collide with a JSON-cased field name
// (e.g. PrimaryStats.int). Escaped with the @ verbatim-identifier prefix.
const CSHARP_KEYWORDS = new Set([
  'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked',
  'class', 'const', 'continue', 'decimal', 'default', 'delegate', 'do', 'double', 'else',
  'enum', 'event', 'explicit', 'extern', 'false', 'finally', 'fixed', 'float', 'for',
  'foreach', 'goto', 'if', 'implicit', 'in', 'int', 'interface', 'internal', 'is', 'lock',
  'long', 'namespace', 'new', 'null', 'object', 'operator', 'out', 'override', 'params',
  'private', 'protected', 'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed',
  'short', 'sizeof', 'stackalloc', 'static', 'string', 'struct', 'switch', 'this', 'throw',
  'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe', 'ushort', 'using',
  'virtual', 'void', 'volatile', 'while',
])

function escapeCsIdentifier(name: string): string {
  return CSHARP_KEYWORDS.has(name) ? `@${name}` : name
}

function emitField(prop: PropertySignature, ownerName: string, ctx: EmitCtx): string {
  const name = prop.getName()
  const optional = prop.hasQuestionToken()
  const csType = csharpType(prop.getTypeNode(), ownerName, name, ctx)
  const nullable = optional ? '?' : ''
  const isLiteralDefault = prop.getTypeNode()?.getKind() === SyntaxKind.LiteralType
  const literalText = isLiteralDefault ? prop.getTypeNode()!.getText() : undefined
  const initializer = literalText ? ` = ${literalText};` : ';'
  return `        public ${csType}${nullable} ${escapeCsIdentifier(name)}${initializer}`
}

function emitInterface(iface: InterfaceDeclaration, ctx: EmitCtx): string {
  const name = iface.getName()
  const fields = iface.getProperties().map((p) => emitField(p, name, ctx))
  return `    public sealed class ${name} {\n${fields.join('\n')}\n    }`
}

function emitMatchEventTypeEnum(project: Project, ctx: EmitCtx): string | undefined {
  const sf = project.getSourceFiles()[0]
  const alias = sf.getTypeAlias('MatchEventType')
  if (!alias) return undefined
  const union = alias.getTypeNode()
  if (!union || union.getKind() !== SyntaxKind.UnionType) return undefined
  const members = union
    .asKindOrThrow(SyntaxKind.UnionType)
    .getTypeNodes()
    .map((n) => n.getText().replace(/^"|"$/g, ''))
  ctx.enumNames.add('MatchEventType')
  return `    public enum MatchEventType {\n${members.map((m) => `        ${m},`).join('\n')}\n    }`
}

export function genMetaCsharp(typesFilePath: string): string {
  const project = new Project({ compilerOptions: { allowJs: false } })
  project.addSourceFileAtPath(typesFilePath)
  const sf = project.getSourceFiles()[0]

  const ctx: EmitCtx = { extraTypes: new Map(), enumNames: new Set() }

  const enumBlock = emitMatchEventTypeEnum(project, ctx)

  const bodies: string[] = []
  for (const name of INTERFACE_ORDER) {
    const iface = sf.getInterface(name)
    if (!iface) throw new Error(`gen-csharp-meta: interface ${name} not found in ${typesFilePath}`)
    bodies.push(emitInterface(iface, ctx))
  }

  const header = [
    '//',
    '// THIS FILE HAS BEEN GENERATED AUTOMATICALLY',
    '// DO NOT CHANGE IT MANUALLY UNLESS YOU KNOW WHAT YOU\'RE DOING',
    '//',
    '// GENERATED BY colyseus-server/scripts/codegen/gen-csharp-meta.ts FROM contracts/src/meta/types.ts',
    '//',
    '',
    'using System.Collections.Generic;',
    '',
    `namespace ${NAMESPACE} {`,
  ].join('\n')

  const nested = [...ctx.extraTypes.values()].filter(Boolean)

  const footer = '}\n'

  return [header, enumBlock, ...bodies, ...nested, footer].filter(Boolean).join('\n\n') + '\n'
}

// CLI driver: args are (typesFilePath, outputFilePath).
if (require.main === module) {
  const [, , typesFilePath, outputFilePath] = process.argv
  if (!typesFilePath || !outputFilePath) {
    console.error('usage: gen-csharp-meta <typesFilePath> <outputFilePath>')
    process.exit(1)
  }
  const fs = require('fs')
  const path = require('path')
  const code = genMetaCsharp(typesFilePath)
  fs.mkdirSync(path.dirname(outputFilePath), { recursive: true })
  fs.writeFileSync(outputFilePath, code)
  console.log(`gen-csharp-meta: wrote ${outputFilePath}`)
}
