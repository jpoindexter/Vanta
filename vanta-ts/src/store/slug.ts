/**
 * Reduce an arbitrary skill name to a safe directory slug. Strips path
 * separators and traversal so a skill write can never escape skillsDir().
 */
export function slugifySkillName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-_ ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "unnamed-skill";
}
