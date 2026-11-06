// Pure ref -> chapter routing for the lore panel (DOM-free so tests can import it).

/**
 * Resolves which chapter ID owns a given loreRef.
 */
export function chapterForRef(ref) {
  if (!ref || typeof ref !== "string") return "premise";
  if (ref.startsWith("epoch-")) return "epochs";
  if (ref.startsWith("god-")) return "gods";
  if (
    ref.startsWith("race-") ||
    ["human_demi_human", "dwarf", "ogre_orc", "furral", "lunar", "dark_lunar"].includes(ref)
  ) {
    return "races";
  }
  if (ref.startsWith("continent-")) return "continents";
  if (ref === "beast_animal_brute" || ref.startsWith("boss-")) return "bosses";
  if (ref.startsWith("mystery-")) return "mysteries";
  if (ref.startsWith("system-")) return "systems";
  return "premise";
}
